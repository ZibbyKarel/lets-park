/**
 * An in-memory stand-in for `PrismaService`, for the domain services' unit
 * tests.
 *
 * Docker is unavailable in this environment, so nothing here has ever spoken to
 * a real Postgres. This double is therefore deliberately narrow: it implements
 * only the query shapes the Task 12 services actually issue, and it **fails
 * loudly** on anything else rather than quietly returning `[]`. A double that
 * silently answers a query it does not understand is how a test passes while the
 * code it covers is wrong.
 *
 * Two behaviours are modelled rather than stubbed, because a loose fake of
 * either would make the test that depends on it worthless:
 *
 * - **Unique constraints.** `ParkingSpot.label` and `User.icsToken` raise a real
 *   `Prisma.PrismaClientKnownRequestError` P2002 with the `meta.target` Postgres
 *   produces. `MeService`'s ICS-token retry loop exists for exactly that error.
 * - **`@db.Date` comparison.** A reservation's day is compared as the UTC
 *   midnight `Date` the pg adapter produces, so `date: { gte }` behaves the way
 *   `SpotsService.deactivate` assumes.
 *
 * What it cannot prove is stated in the task report: this is a faithful model of
 * the constraints, not the constraints.
 *
 * Spec-only support code, excluded from `tsconfig.app.json`.
 */

import { randomUUID } from 'node:crypto';
import type {
  AuditLog as AuditLogRow,
  ParkingSpot as ParkingSpotRow,
  Reservation as ReservationRow,
  ReservationWindowSettings as WindowSettingsRow,
  User as UserRow,
  WaitlistEntry as WaitlistEntryRow,
} from '@lets-park/database';
import { Prisma } from '@lets-park/database';
import type { PrismaService } from '../database/prisma.service';

const CLIENT_VERSION = '7.10.0';

/**
 * A `P2002` in the shape `@prisma/adapter-pg` actually produces.
 *
 * This function used to emit `meta: { target: [...] }`, which is what Prisma
 * *documents* and what the query-engine client emits — but not what this
 * project's driver adapter emits. Nothing here failed; the filter's mapping was
 * green against a shape reality never sends, so every real unique violation
 * degraded to `CONFLICT` and `SPOT_ALREADY_RESERVED` could not fire at all.
 *
 * The shape below is transcribed from a live PostgreSQL 17 and is re-asserted
 * against one on every `nx run api:test-db`
 * (`src/database/database-contract.db.spec.ts`). If Prisma changes it, that
 * suite fails and this constructor is what has to be corrected — which is the
 * arrangement that was missing.
 */
function uniqueViolation(table: string, column: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    `Unique constraint failed on the fields: (\`${column}\`)`,
    {
      code: 'P2002',
      clientVersion: CLIENT_VERSION,
      meta: {
        modelName: table,
        driverAdapterError: {
          cause: {
            originalCode: '23505',
            kind: 'UniqueConstraintViolation',
            constraint: { index: `${table}_${column}_key` },
            table,
          },
        },
      },
    }
  );
}

function recordNotFound(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Record to update not found.', {
    code: 'P2025',
    clientVersion: CLIENT_VERSION,
  });
}

/** Anything this double was not taught is a bug in the test, not an empty result. */
function unsupported(what: string, args: unknown): never {
  throw new Error(`PrismaDouble does not model ${what}: ${JSON.stringify(args)}`);
}

/**
 * Rows come out of a real Prisma client as fresh objects deserialised from the
 * driver, never as a live handle on stored state. Copying on the way out matters
 * for more than tidiness: a service that reads a row, mutates it and then
 * compares "before" against "after" would compare an object with itself if the
 * two were the same reference — and the test that caught this was asserting an
 * audit payload's before/after pair.
 */
function copy<T>(row: T): T {
  return { ...row };
}

export interface SpotSeed {
  id?: string;
  label: string;
  group?: ParkingSpotRow['group'];
  active?: boolean;
}

export interface UserSeed {
  id?: string;
  oktaId?: string;
  email?: string;
  name?: string;
  role?: UserRow['role'];
  active?: boolean;
  licensePlate?: string | null;
  icsToken?: string;
  preferredParkingSpotId?: string | null;
}

export interface ReservationSeed {
  id?: string;
  parkingSpotId: string;
  userId: string;
  /** `YYYY-MM-DD`. */
  date: string;
  createdAt?: Date;
}

export interface WaitlistSeed {
  id?: string;
  parkingSpotId: string;
  userId: string;
  /** `YYYY-MM-DD`. */
  date: string;
  createdAt?: Date;
}

const EPOCH = new Date('2026-01-01T00:00:00.000Z');

export class PrismaDouble {
  readonly spots: ParkingSpotRow[] = [];
  readonly users: UserRow[] = [];
  readonly reservations: ReservationRow[] = [];
  readonly waitlist: WaitlistEntryRow[] = [];
  readonly auditLogs: AuditLogRow[] = [];
  windowSettings: WindowSettingsRow | null = null;

  /**
   * How many of the next `user.update` calls carrying an `icsToken` should be
   * rejected with P2002.
   *
   * A generated token cannot be made to collide from the outside — that is the
   * point of 32 bytes of `randomBytes` — so the collision has to be induced at
   * the layer that would actually detect it: the unique index. This is the same
   * error Postgres raises, at the same moment, which is what `MeService`'s retry
   * loop is written against.
   */
  icsTokenCollisions = 0;

  // --- seeding ------------------------------------------------------------

  seedSpot(seed: SpotSeed): ParkingSpotRow {
    const row: ParkingSpotRow = {
      id: seed.id ?? randomUUID(),
      label: seed.label,
      group: seed.group ?? 'SHARED',
      active: seed.active ?? true,
      createdAt: EPOCH,
      updatedAt: EPOCH,
    };
    this.spots.push(row);
    return row;
  }

  seedUser(seed: UserSeed = {}): UserRow {
    const id = seed.id ?? randomUUID();
    const row: UserRow = {
      id,
      email: seed.email ?? `${id}@example.test`,
      name: seed.name ?? `User ${id.slice(0, 4)}`,
      licensePlate: seed.licensePlate ?? null,
      role: seed.role ?? 'USER',
      oktaId: seed.oktaId ?? `okta-${id}`,
      active: seed.active ?? true,
      icsToken: seed.icsToken ?? `token-${id}`,
      preferredParkingSpotId: seed.preferredParkingSpotId ?? null,
      createdAt: EPOCH,
      updatedAt: EPOCH,
    };
    this.users.push(row);
    return row;
  }

  seedReservation(seed: ReservationSeed): ReservationRow {
    const row: ReservationRow = {
      id: seed.id ?? randomUUID(),
      parkingSpotId: seed.parkingSpotId,
      userId: seed.userId,
      date: new Date(`${seed.date}T00:00:00.000Z`),
      createdAt: seed.createdAt ?? EPOCH,
    };
    this.reservations.push(row);
    return row;
  }

  seedWaitlistEntry(seed: WaitlistSeed): WaitlistEntryRow {
    const row: WaitlistEntryRow = {
      id: seed.id ?? randomUUID(),
      parkingSpotId: seed.parkingSpotId,
      userId: seed.userId,
      date: new Date(`${seed.date}T00:00:00.000Z`),
      createdAt: seed.createdAt ?? EPOCH,
    };
    this.waitlist.push(row);
    return row;
  }

  seedWindowSettings(settings: Partial<Omit<WindowSettingsRow, 'id'>> = {}): WindowSettingsRow {
    this.windowSettings = {
      id: 1,
      openDaysBefore: settings.openDaysBefore ?? 7,
      lockMode: settings.lockMode ?? 'AUTO',
      updatedAt: EPOCH,
    };
    return this.windowSettings;
  }

  /** Drop it in with `{ provide: PrismaService, useValue: double.asPrismaService() }`. */
  asPrismaService(): PrismaService {
    return { client: this.client() } as unknown as PrismaService;
  }

  // --- delegates ----------------------------------------------------------

  private client() {
    return {
      parkingSpot: this.parkingSpotDelegate(),
      user: this.userDelegate(),
      reservation: this.reservationDelegate(),
      waitlistEntry: this.waitlistDelegate(),
      reservationWindowSettings: this.windowSettingsDelegate(),
      auditLog: this.auditLogDelegate(),
    };
  }

  private parkingSpotDelegate() {
    return {
      findMany: async (
        args: {
          where?: { active?: boolean; group?: ParkingSpotRow['group'] };
          orderBy?: unknown;
        } = {}
      ) => {
        const where = args.where ?? {};
        return this.spots
          .filter((row) => where.active === undefined || row.active === where.active)
          .filter((row) => where.group === undefined || row.group === where.group)
          .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label))
          .map(copy);
      },
      findUnique: async (args: { where: { id?: string; label?: string } }) => {
        const { id, label } = args.where;
        const row = this.spots.find(
          (candidate) =>
            (id !== undefined && candidate.id === id) ||
            (label !== undefined && candidate.label === label)
        );
        return row === undefined ? null : copy(row);
      },
      create: async (args: { data: { label: string; group: ParkingSpotRow['group'] } }) => {
        if (this.spots.some((row) => row.label === args.data.label)) {
          throw uniqueViolation('ParkingSpot', 'label');
        }
        return copy(this.seedSpot({ label: args.data.label, group: args.data.group }));
      },
      update: async (args: {
        where: { id: string };
        data: Partial<Pick<ParkingSpotRow, 'label' | 'group' | 'active'>>;
      }) => {
        const row = this.spots.find((candidate) => candidate.id === args.where.id);
        if (row === undefined) {
          throw recordNotFound();
        }
        if (
          args.data.label !== undefined &&
          this.spots.some(
            (candidate) => candidate.label === args.data.label && candidate.id !== row.id
          )
        ) {
          throw uniqueViolation('ParkingSpot', 'label');
        }
        Object.assign(row, args.data, { updatedAt: new Date() });
        return copy(row);
      },
    };
  }

  private userDelegate() {
    return {
      findMany: async (args: { where?: UserWhere; orderBy?: unknown } = {}) =>
        this.users
          .filter((row) => matchesUserWhere(row, args.where ?? {}))
          .sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email))
          .map(copy),
      findUnique: async (args: { where: { id?: string; email?: string; oktaId?: string } }) => {
        const { id, email, oktaId } = args.where;
        if (id === undefined && email === undefined && oktaId === undefined) {
          return unsupported('a user lookup without id, email or oktaId', args.where);
        }
        const row = this.users.find(
          (candidate) =>
            (id !== undefined && candidate.id === id) ||
            (email !== undefined && candidate.email === email) ||
            (oktaId !== undefined && candidate.oktaId === oktaId)
        );
        return row === undefined ? null : copy(row);
      },
      // Just-in-time provisioning (`AuthUserService`) creates a row for a
      // subject the database has never seen; the oRPC pipeline test goes through
      // the real guard, so it goes through this.
      create: async (args: {
        data: { oktaId: string; email: string; name: string; icsToken: string };
      }) => {
        for (const [column, value] of [
          ['oktaId', args.data.oktaId],
          ['email', args.data.email],
          ['icsToken', args.data.icsToken],
        ] as const) {
          if (this.users.some((row) => row[column] === value)) {
            throw uniqueViolation('User', column);
          }
        }
        return copy(
          this.seedUser({
            oktaId: args.data.oktaId,
            email: args.data.email,
            name: args.data.name,
            icsToken: args.data.icsToken,
          })
        );
      },
      count: async (args: { where?: UserWhere } = {}) =>
        this.users.filter((row) => matchesUserWhere(row, args.where ?? {})).length,
      update: async (args: { where: { id: string }; data: UserUpdateData }) => {
        const row = this.users.find((candidate) => candidate.id === args.where.id);
        if (row === undefined) {
          throw recordNotFound();
        }
        const { preferredParkingSpot, ...scalars } = args.data;
        if (scalars.icsToken !== undefined) {
          if (this.icsTokenCollisions > 0) {
            this.icsTokenCollisions -= 1;
            throw uniqueViolation('User', 'icsToken');
          }
          if (
            this.users.some(
              (candidate) => candidate.icsToken === scalars.icsToken && candidate.id !== row.id
            )
          ) {
            throw uniqueViolation('User', 'icsToken');
          }
        }
        Object.assign(row, scalars, { updatedAt: new Date() });
        if (preferredParkingSpot !== undefined) {
          row.preferredParkingSpotId =
            'disconnect' in preferredParkingSpot ? null : preferredParkingSpot.connect.id;
        }
        return copy(row);
      },
    };
  }

  private reservationDelegate() {
    return {
      findMany: async (args: { where: { date: Date }; include?: unknown }) => {
        if (!(args.where.date instanceof Date)) {
          return unsupported('a reservation filter other than an exact date', args.where);
        }
        const target = args.where.date.getTime();
        return this.reservations
          .filter((row) => row.date.getTime() === target)
          .map((row) => ({ ...row, user: copy(this.requireUser(row.userId)) }));
      },
      count: async (args: { where: { parkingSpotId: string; date: { gte: Date } } }) => {
        const gte = args.where.date?.gte;
        if (!(gte instanceof Date)) {
          return unsupported('a reservation count without a `date.gte` bound', args.where);
        }
        return this.reservations.filter(
          (row) =>
            row.parkingSpotId === args.where.parkingSpotId && row.date.getTime() >= gte.getTime()
        ).length;
      },
    };
  }

  private waitlistDelegate() {
    return {
      findMany: async (args: { where: { date: Date }; orderBy?: unknown; select?: unknown }) => {
        const target = args.where.date.getTime();
        return this.waitlist
          .filter((row) => row.date.getTime() === target)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
          .map(copy);
      },
    };
  }

  private windowSettingsDelegate() {
    return {
      findUnique: async () => (this.windowSettings === null ? null : copy(this.windowSettings)),
      upsert: async (args: {
        create: { id: number; openDaysBefore: number; lockMode: WindowSettingsRow['lockMode'] };
        update: { openDaysBefore: number; lockMode: WindowSettingsRow['lockMode'] };
      }) => {
        if (this.windowSettings === null) {
          this.windowSettings = { ...args.create, updatedAt: new Date() };
        } else {
          this.windowSettings = { ...this.windowSettings, ...args.update, updatedAt: new Date() };
        }
        return copy(this.windowSettings);
      },
    };
  }

  private auditLogDelegate() {
    return {
      create: async (args: { data: Omit<AuditLogRow, 'id' | 'createdAt'> }) => {
        const row: AuditLogRow = { id: randomUUID(), createdAt: new Date(), ...args.data };
        this.auditLogs.push(row);
        return copy(row);
      },
    };
  }

  private requireUser(id: string): UserRow {
    const user = this.users.find((row) => row.id === id);
    if (user === undefined) {
      throw new Error(`PrismaDouble: reservation references an unseeded user ${id}`);
    }
    return user;
  }
}

interface UserWhere {
  role?: UserRow['role'];
  active?: boolean;
  id?: { not: string };
  OR?: { name?: { contains: string; mode: string }; email?: { contains: string; mode: string } }[];
}

type UserUpdateData = Partial<
  Pick<UserRow, 'role' | 'active' | 'licensePlate' | 'icsToken' | 'name' | 'oktaId'>
> & {
  preferredParkingSpot?: { disconnect: true } | { connect: { id: string } };
};

function matchesUserWhere(row: UserRow, where: UserWhere): boolean {
  if (where.role !== undefined && row.role !== where.role) {
    return false;
  }
  if (where.active !== undefined && row.active !== where.active) {
    return false;
  }
  if (where.id !== undefined && row.id === where.id.not) {
    return false;
  }
  if (where.OR !== undefined) {
    const matches = where.OR.some((clause) => {
      const name = clause.name?.contains;
      const email = clause.email?.contains;
      return (
        (name !== undefined && row.name.toLowerCase().includes(name.toLowerCase())) ||
        (email !== undefined && row.email.toLowerCase().includes(email.toLowerCase()))
      );
    });
    if (!matches) {
      return false;
    }
  }
  return true;
}
