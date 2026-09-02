/**
 * Wiring for the reservation `*.db.spec.ts` suites: the real services, over a
 * real PostgreSQL, with nothing faked but the publisher.
 *
 * There is deliberately **no `PrismaDouble` here**. The double is the right tool
 * for the Task 12 services, whose logic is branches; it is the wrong tool for
 * this task, whose correctness is `FOR UPDATE`, transaction isolation and the
 * exact shape of a `P2002` — none of which a double can model, and the last of
 * which this project has already been burned by faking
 * (`database-contract.db.spec.ts`, first paragraph).
 *
 * The publisher is a recorder rather than a stub because *when* it is called is
 * the thing under test: {@link RecordingPublisher} reads the database on its own
 * connection at the moment it is invoked, which can only see committed rows.
 */

import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../auth/authenticated-user';
import { AuditLogService } from '../../audit/audit-log.service';
import type { PrismaClient, User as UserRow, ParkingSpot as SpotRow } from '@lets-park/database';
import { createPrismaClient } from '@lets-park/database';
import type { DateOnly } from '@lets-park/shared-types';
import type { PrismaService } from '../../database/prisma.service';
import type { DomainEvent, WaitlistPromotionNotice } from '../../reservations/reservation-events';
import { DomainEventPublisher } from '../../reservations/reservation-events';
import { ReservationPolicy } from '../../reservations/reservation-policy';
import { ReservationsService } from '../../reservations/reservations.service';
import { WaitlistPromotionService } from '../../reservations/waitlist-promotion.service';
import { WaitlistService } from '../../reservations/waitlist.service';
import { ReservationWindowService } from '../../reservation-window/reservation-window.service';
import { requireDatabaseUrl } from './test-database';

/**
 * A publisher that remembers what it was handed, and optionally runs a probe at
 * the moment it is handed it.
 *
 * The probe is how "nothing is published inside the transaction" stops being a
 * claim: the ordering spec gives it a callback that queries a **second**
 * connection for the row the transaction just wrote. A second connection cannot
 * see an uncommitted row, so the probe finding it proves `COMMIT` already
 * happened.
 */
export class RecordingPublisher extends DomainEventPublisher {
  readonly events: DomainEvent[] = [];
  readonly notices: WaitlistPromotionNotice[] = [];

  /** Run synchronously on every `publish`. Set by the ordering spec. */
  onPublish: ((events: readonly DomainEvent[]) => void) | undefined;

  publish(events: readonly DomainEvent[]): void {
    this.events.push(...events);
    this.onPublish?.(events);
  }

  notifyPromotions(notices: readonly WaitlistPromotionNotice[]): void {
    this.notices.push(...notices);
  }

  /** Every recorded event of one kind, narrowed. */
  ofKind<K extends DomainEvent['name']>(name: K): Extract<DomainEvent, { name: K }>[] {
    return this.events.filter(
      (event): event is Extract<DomainEvent, { name: K }> => event.name === name
    );
  }

  reset(): void {
    this.events.length = 0;
    this.notices.length = 0;
    this.onPublish = undefined;
  }
}

export interface Harness {
  prisma: PrismaClient;
  reservations: ReservationsService;
  waitlist: WaitlistService;
  window: ReservationWindowService;
  publisher: RecordingPublisher;
}

/** A `PrismaService` over an already-built client. Only `client` is ever used. */
export function asPrismaService(client: PrismaClient): PrismaService {
  return { client } as unknown as PrismaService;
}

/** A fresh connection pool. Separate clients are how a spec gets a real race. */
export function connect(): PrismaClient {
  return createPrismaClient({ connectionString: requireDatabaseUrl() });
}

/** The services, assembled the way `ReservationsModule` assembles them. */
export function buildHarness(client: PrismaClient): Harness {
  const prismaService = asPrismaService(client);
  const audit = new AuditLogService(prismaService);
  const window = new ReservationWindowService(prismaService, audit);
  const policy = new ReservationPolicy();
  const promotion = new WaitlistPromotionService(audit);
  const publisher = new RecordingPublisher();

  return {
    prisma: client,
    window,
    publisher,
    reservations: new ReservationsService(
      prismaService,
      window,
      policy,
      promotion,
      audit,
      publisher
    ),
    waitlist: new WaitlistService(prismaService, window, policy, publisher, audit),
  };
}

// --- fixtures ---------------------------------------------------------------

/**
 * A value nothing else in the database can collide with.
 *
 * The random segment is not decoration. Jest gives each spec file its own module
 * registry, so a counter alone restarts at zero per file while `process.pid`
 * stays the same — and the suites share one database, so the second file's
 * fixtures collided with the first's on `User_email_key`.
 */
const RUN_ID = randomUUID().slice(0, 8);
let counter = 0;
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}-${RUN_ID}-${counter}`;
}

export async function seedUser(
  client: PrismaClient,
  overrides: { name?: string; licensePlate?: string | null } = {}
): Promise<UserRow> {
  return client.user.create({
    data: {
      email: `${unique('user')}@example.test`,
      name: overrides.name ?? unique('Tester'),
      licensePlate: overrides.licensePlate ?? null,
      oktaId: unique('okta'),
      icsToken: unique('ics'),
    },
  });
}

export async function seedSpot(client: PrismaClient): Promise<SpotRow> {
  return client.parkingSpot.create({ data: { label: unique('SPOT'), group: 'SHARED' } });
}

/** The `AuthenticatedUser` a controller would hand the service for this row. */
export function actorFor(
  user: UserRow,
  role: AuthenticatedUser['role'] = 'USER'
): AuthenticatedUser {
  return {
    id: user.id,
    oktaId: user.oktaId,
    email: user.email,
    name: user.name,
    role,
    active: true,
  };
}

/**
 * The window settings for a whole test, as a lock mode.
 *
 * The override modes are used rather than arithmetic on `today` because they
 * make the *intent* of a test readable — "this month is locked" — and because
 * `monthLockState` treats them as the first thing it checks, so a test using one
 * is testing the service's use of the rule rather than re-deriving the rule.
 * `isMonthOpen` is still the only implementation of it.
 */
export async function setLockMode(
  client: PrismaClient,
  lockMode: 'AUTO' | 'FORCE_OPEN' | 'FORCE_LOCKED'
): Promise<void> {
  await client.reservationWindowSettings.update({ where: { id: 1 }, data: { lockMode } });
}

/**
 * A day far enough in the future that no real "today" can overtake it, and a
 * business day so the lot is open at all.
 *
 * `2099-01-05` is a Monday. The suites assert that with `isBusinessDay` rather
 * than trusting this comment.
 */
export const FUTURE_BUSINESS_DAY = '2099-01-05' as DateOnly;
/** The Tuesday after it, for tests that need two distinct days. */
export const NEXT_BUSINESS_DAY = '2099-01-06' as DateOnly;
/** The Saturday of that week. */
export const FUTURE_WEEKEND_DAY = '2099-01-03' as DateOnly;
/** A day used as "today" that is safely before {@link FUTURE_BUSINESS_DAY}. */
export const TODAY = '2098-12-29' as DateOnly;

/**
 * A promise plus its resolver, for driving two transactions into a chosen
 * interleaving.
 *
 * Without one of these a "concurrency test" is two `await`s that happen to run
 * in sequence — which is exactly how a previous task in this build shipped a
 * concurrency test that passed with the retry logic deleted.
 */
export function barrier(): { wait: Promise<void>; release: () => void } {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

/** A transaction held open at a chosen point, so another one can be run into it. */
export interface HeldTransaction<T> {
  /** Resolves once `work` has run and the transaction is holding its locks. */
  ready: Promise<T>;
  /** Lets the transaction commit. */
  release: () => void;
  /** Resolves when it has committed. */
  done: Promise<void>;
}

/**
 * Runs `work` inside a transaction and then **stops**, holding every lock it
 * took until {@link HeldTransaction.release} is called.
 *
 * This is what makes a concurrency test deterministic rather than hopeful. The
 * alternative — firing two operations with `Promise.all` and trusting them to
 * collide — is how a previous task in this build shipped a "concurrency test"
 * that passed with its retry logic deleted: each side cost enough event-loop
 * time that no interleaving ever happened.
 */
export function holdTransaction<T>(
  client: PrismaClient,
  work: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>
): HeldTransaction<T> {
  const gate = barrier();
  let signalReady!: (value: T) => void;
  let failReady!: (error: unknown) => void;
  const ready = new Promise<T>((resolve, reject) => {
    signalReady = resolve;
    failReady = reject;
  });

  const done = client
    .$transaction(
      async (tx) => {
        try {
          signalReady(await work(tx));
        } catch (error) {
          failReady(error);
          throw error;
        }
        await gate.wait;
      },
      { maxWait: 10_000, timeout: 60_000 }
    )
    .then(() => undefined);

  return { ready, release: gate.release, done };
}

/**
 * Waits until some backend in this database is blocked on a lock.
 *
 * Needed for exactly one shape of test: "start an operation, let it run until it
 * cannot proceed, *then* release the thing it is waiting for". A fixed sleep
 * would be either flaky or slow; `pg_stat_activity` says when the wait has
 * actually begun. A blocked `INSERT` waiting on another transaction's uncommitted
 * unique key shows up here as `wait_event_type = 'Lock'`.
 *
 * Throws rather than returning on timeout: "nothing ever blocked" means the test
 * did not set up the race it claims to be testing, and silently continuing would
 * turn that into a pass.
 */
export async function waitForBlockedBackend(
  client: PrismaClient,
  timeoutMs = 10_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const [row] = await client.$queryRaw<{ blocked: bigint }[]>`
      SELECT count(*) AS blocked
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
    `;
    if (row !== undefined && Number(row.blocked) > 0) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(
        'No backend ever blocked on a lock. The race this test claims to set up did not happen.'
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
