/**
 * Bulk booking: `reservation.previewBulk` and `reservation.confirmBulk`.
 *
 * One allocator (`bulk-allocator.ts`, pure), two callers. The preview runs it
 * against a snapshot and returns the plan; the confirmation runs it inside one
 * interactive transaction and then writes what it can. Nothing about *which*
 * spot a day should get lives in this file — that is the whole point of the
 * split, because a preview that predicted a different spot from the one the
 * confirmation takes would be worse than no preview at all.
 *
 * ## `previewBulk` writes nothing
 *
 * No transaction, no lock, no row. It is a read of the same four things the
 * confirmation reads, handed to the same function. `bulk-reservation.db.spec.ts`
 * asserts that by counting `Reservation`, `WaitlistEntry` and `AuditLog` rows
 * either side of a preview and requiring all three to be unchanged — a claim a
 * return-value assertion could never make.
 *
 * It still refuses a locked month and a past day, because a plan the caller can
 * never confirm is not a useful answer, and because the contract declares those
 * errors on both procedures for exactly that reason.
 *
 * ## `confirmBulk` never lets a statement fail
 *
 * The rule is: **one day colliding must not discard the batch**. Task 13
 * established why that is hard — a failed statement aborts a PostgreSQL
 * transaction, and Prisma exposes no savepoints, which is why
 * `ReservationsService.cancel` retries the whole transaction rather than
 * catching a `P2002` inside it.
 *
 * So this transaction never raises one. Both write phases go through
 * `createManyAndReturn({ skipDuplicates: true })` — `INSERT … ON CONFLICT DO
 * NOTHING RETURNING …` — so a cell somebody took between the preview and the
 * confirmation comes back as a **missing row**, not as an error. The transaction
 * stays alive, that day falls to the waitlist, and the result says so. There is
 * no retry loop here, and there does not need to be one.
 *
 * ## Deadlock: the ascending-date order is the lock ordering
 *
 * A bulk confirmation touches up to 31 `(spot, date)` cells, which is up to 31
 * uncommitted unique keys held at once — Task 13's deadlock risk, multiplied.
 * What removes the cycle is that **every** confirmation acquires those keys in
 * ascending date order (`allocateBulk` sorts, and both write phases preserve
 * that order), and that each date takes at most **one** reservation key: a
 * transaction waiting at date *d* holds no key at date *d*, so two of them
 * cannot each hold what the other wants. Two users submitting the same days in
 * opposite request order therefore serialise instead of deadlocking, which
 * `bulk-concurrency.db.spec.ts` forces and which fails the moment the sort is
 * removed. Full analysis in `doc/decision/0092-*` and `doc/bulk-reservation.md`.
 *
 * No `FOR UPDATE` is taken and nothing is deleted, so this path also stays out
 * of the cancel/promote cycle documented in `doc/decision/0065-*`.
 *
 * ## Nothing that can block on the network happens inside the transaction
 *
 * Same seam as Task 13: the callback returns its events, and they are published
 * after `await` has resolved. See `reservation-events.ts`.
 */

import { Injectable } from '@nestjs/common';
import type {
  BulkBookingInput,
  BulkBookingSummary,
  BulkDayPlan,
  BulkDayResult,
  ConfirmBulkOutput,
  PreviewBulkOutput,
  ReservationWindowSettings,
} from '@lets-park/contract';
import type { Prisma } from '@lets-park/database';
import type { DateOnly } from '@lets-park/shared-types';
import { compareDateOnly, todayInPrague } from '@lets-park/shared-types';
import type { AuditEntry } from '../audit/audit-log.service';
import { AuditLogService } from '../audit/audit-log.service';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { DomainError } from '../common/errors/domain-error';
import { toDateColumn, toDateOnly, toPublicReservation } from '../common/prisma-mapping';
import { PrismaService } from '../database/prisma.service';
import { ReservationWindowService } from '../reservation-window/reservation-window.service';
import type { AllocatableSpot, DayState } from './bulk-allocator';
import { allocateBulk, shortestQueue } from './bulk-allocator';
import type { DomainEvent } from './reservation-events';
import { DomainEventPublisher } from './reservation-events';
import { ReservationPolicy } from './reservation-policy';

/**
 * Same reasoning as the cancel path: this transaction can legitimately *wait* —
 * on another confirmation's uncommitted keys — and `maxWait` (how long to wait
 * for a connection from the pool) is a different and much shorter thing.
 */
const BULK_TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 15_000 } as const;

/** The reservation fields a created row has to give back. */
interface CreatedReservation {
  id: string;
  parkingSpotId: string;
  userId: string;
  date: Date;
  createdAt: Date;
}

/** One queue entry, as the insert and the position read-back both return it. */
interface QueueRow {
  id: string;
  parkingSpotId: string;
  userId: string;
  date: Date;
}

/** The spot one day will queue for: an id and the label the result carries. */
interface QueueTarget {
  id: string;
  label: string;
}

/** {@link DayState}, while it is still being assembled. */
interface MutableDayState {
  reservedSpotIds: Set<string>;
  userHasReservation: boolean;
  queuedUserIdsBySpotId: Map<string, string[]>;
}

/** Everything both procedures read before they can decide anything. */
interface World {
  spots: AllocatableSpot[];
  preferredParkingSpotId: string | null;
  holder: { id: string; name: string; licensePlate: string | null };
  stateByDate: ReadonlyMap<DateOnly, DayState>;
}

/** What one confirmation produced, before anything is broadcast. */
interface ConfirmOutcome {
  result: ConfirmBulkOutput;
  events: DomainEvent[];
}

/** A `(spot, date)` cell, as a map key. */
function cellKey(parkingSpotId: string, date: DateOnly): string {
  return `${date}|${parkingSpotId}`;
}

@Injectable()
export class BulkReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly window: ReservationWindowService,
    private readonly policy: ReservationPolicy,
    private readonly audit: AuditLogService,
    private readonly publisher: DomainEventPublisher
  ) {}

  /** The read-only proposal. Writes nothing — see the class comment. */
  async preview(
    input: BulkBookingInput,
    actor: AuthenticatedUser,
    today: DateOnly = todayInPrague()
  ): Promise<PreviewBulkOutput> {
    const settings = await this.window.getSettings();
    const dates = this.assertRequestable(input.dates, actor, settings, today);
    const month = this.monthOf(dates);

    const world = await this.readWorld(this.prisma.client, dates, actor.id);
    const days = this.inRequestOrder(input.dates, this.allocate(dates, world, actor.id));

    return {
      month,
      preferredParkingSpotId: world.preferredParkingSpotId,
      days,
      summary: this.summarise(days),
    };
  }

  /** The real booking. One transaction; broadcasts strictly after it commits. */
  async confirm(
    input: BulkBookingInput,
    actor: AuthenticatedUser,
    today: DateOnly = todayInPrague()
  ): Promise<ConfirmBulkOutput> {
    const settings = await this.window.getSettings();
    const dates = this.assertRequestable(input.dates, actor, settings, today);
    const month = this.monthOf(dates);

    const outcome = await this.prisma.client.$transaction(
      (tx) => this.confirmOnce(tx, input.dates, dates, month, actor),
      BULK_TRANSACTION_OPTIONS
    );

    // Past `await`, so past `COMMIT`. Nothing above this line may talk to Slack
    // or Socket.io. There are no promotion notices: bulk booking never promotes
    // anybody, it only queues them.
    this.publisher.publish(outcome.events);
    return outcome.result;
  }

  /**
   * The whole confirmation, inside `tx`.
   *
   * Read, allocate, insert the reservations, insert the queue entries for what
   * is left, read the positions back, audit — in that order, and the order is
   * load-bearing: the queue target for a day that *lost* its spot can only be
   * chosen once the reservation phase has said which days lost.
   */
  private async confirmOnce(
    tx: Prisma.TransactionClient,
    requested: readonly DateOnly[],
    dates: readonly DateOnly[],
    month: string,
    actor: AuthenticatedUser
  ): Promise<ConfirmOutcome> {
    const world = await this.readWorld(tx, dates, actor.id);
    const plans = this.allocate(dates, world, actor.id);

    const created = await this.createReservations(tx, plans, actor.id);
    const createdByDate = new Map(created.map((row) => [toDateOnly(row.date), row]));

    // Days the allocator wanted to assign and could not. Either somebody took
    // the cell, or the caller acquired a reservation elsewhere that day between
    // the read above and the insert — two different answers, and only a second
    // read can tell them apart.
    const lost = plans.flatMap((plan) =>
      plan.outcome === 'SPOT_ASSIGNED' && !createdByDate.has(plan.date) ? [plan.date] : []
    );
    const busyElsewhere = await this.datesAlreadyReserved(tx, lost, actor.id);

    const targets = this.queueTargets(plans, world, createdByDate, busyElsewhere);
    const queued = await this.createWaitlistEntries(tx, targets, actor.id);
    const queues = await this.readQueues(tx, targets);

    await this.audit.recordMany(
      [...this.reservationAudit(created, actor.id), ...this.queueAudit(queued, actor.id)],
      tx
    );

    const days = this.inRequestOrder(
      requested,
      plans.map((plan) =>
        this.resolve(plan, createdByDate, busyElsewhere, targets, queues, actor.id)
      )
    );

    return {
      result: {
        month,
        preferredParkingSpotId: world.preferredParkingSpotId,
        days,
        summary: this.summarise(days),
      },
      events: [
        ...created.map(
          (row): DomainEvent => ({
            name: 'reservation:created',
            payload: {
              date: toDateOnly(row.date),
              parkingSpotId: row.parkingSpotId,
              reservation: toPublicReservation(row, world.holder),
            },
          })
        ),
        // Only the cells an entry was actually inserted into: a queue whose
        // length did not change is not news, and `skipDuplicates` means a
        // planned entry that was already there changed nothing.
        ...queued.map((row): DomainEvent => {
          const date = toDateOnly(row.date);
          return {
            name: 'waitlist:updated',
            payload: {
              date,
              parkingSpotId: row.parkingSpotId,
              waitlistCount: (queues.get(cellKey(row.parkingSpotId, date)) ?? []).length,
            },
          };
        }),
      ],
    };
  }

  // --- reads -----------------------------------------------------------------

  /**
   * The four reads the allocator needs, as one snapshot.
   *
   * Takes the client rather than reaching for `this.prisma.client`, because the
   * confirmation has to read **inside its own transaction** — a snapshot taken
   * on another connection would be a different world from the one it writes to.
   * That is also why `SpotsService.listActive` is not reused here: it is bound
   * to the request-scoped client and cannot be handed a transaction.
   */
  private async readWorld(
    client: Prisma.TransactionClient,
    dates: readonly DateOnly[],
    userId: string
  ): Promise<World> {
    const dateColumns = dates.map(toDateColumn);

    const [spots, holder, reservations, waitlist] = await Promise.all([
      client.parkingSpot.findMany({
        where: { active: true },
        select: { id: true, label: true, group: true },
      }),
      // `preferredParkingSpotId` and the plate are row facts, not token claims —
      // `AuthenticatedUser` carries neither, exactly as `reservation.create`
      // found when it needed the plate for its broadcast.
      client.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, name: true, licensePlate: true, preferredParkingSpotId: true },
      }),
      client.reservation.findMany({
        where: { date: { in: dateColumns } },
        select: { parkingSpotId: true, userId: true, date: true },
      }),
      client.waitlistEntry.findMany({
        where: { date: { in: dateColumns } },
        // The same order the queue is promoted in and the day overview shows —
        // `createdAt`, then `id`. The position the preview reports is therefore
        // the position that would be promoted.
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { parkingSpotId: true, userId: true, date: true },
      }),
    ]);

    const stateByDate = new Map<DateOnly, MutableDayState>();
    const dayFor = (date: DateOnly): MutableDayState => {
      const existing = stateByDate.get(date);
      if (existing !== undefined) {
        return existing;
      }
      const fresh: MutableDayState = {
        reservedSpotIds: new Set(),
        userHasReservation: false,
        queuedUserIdsBySpotId: new Map(),
      };
      stateByDate.set(date, fresh);
      return fresh;
    };

    for (const date of dates) {
      dayFor(date);
    }
    for (const row of reservations) {
      const day = dayFor(toDateOnly(row.date));
      day.reservedSpotIds.add(row.parkingSpotId);
      if (row.userId === userId) {
        day.userHasReservation = true;
      }
    }
    for (const row of waitlist) {
      const day = dayFor(toDateOnly(row.date));
      const queue = day.queuedUserIdsBySpotId.get(row.parkingSpotId) ?? [];
      queue.push(row.userId);
      day.queuedUserIdsBySpotId.set(row.parkingSpotId, queue);
    }

    return {
      spots,
      holder,
      preferredParkingSpotId: holder.preferredParkingSpotId,
      stateByDate,
    };
  }

  /** Which of `dates` the caller already holds a reservation on. */
  private async datesAlreadyReserved(
    tx: Prisma.TransactionClient,
    dates: readonly DateOnly[],
    userId: string
  ): Promise<Set<DateOnly>> {
    if (dates.length === 0) {
      return new Set();
    }
    const rows = await tx.reservation.findMany({
      where: { userId, date: { in: dates.map(toDateColumn) } },
      select: { date: true },
    });
    return new Set(rows.map((row) => toDateOnly(row.date)));
  }

  /** Every queue the result has to report a position out of, in promotion order. */
  private async readQueues(
    tx: Prisma.TransactionClient,
    targets: ReadonlyMap<DateOnly, QueueTarget>
  ): Promise<Map<string, QueueRow[]>> {
    const queues = new Map<string, QueueRow[]>();
    if (targets.size === 0) {
      return queues;
    }

    const rows = await tx.waitlistEntry.findMany({
      where: {
        date: { in: [...targets.keys()].map(toDateColumn) },
        parkingSpotId: { in: [...new Set([...targets.values()].map((spot) => spot.id))] },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, parkingSpotId: true, userId: true, date: true },
    });

    for (const row of rows) {
      const key = cellKey(row.parkingSpotId, toDateOnly(row.date));
      queues.set(key, [...(queues.get(key) ?? []), row]);
    }
    return queues;
  }

  // --- writes ----------------------------------------------------------------

  /**
   * Inserts the planned reservations, skipping the cells somebody else has
   * taken, and returns only the rows that were actually written.
   *
   * `skipDuplicates` is what keeps one collision from discarding the batch, and
   * the ascending date order of `plans` is what keeps two of these from
   * deadlocking — see the class comment.
   */
  private async createReservations(
    tx: Prisma.TransactionClient,
    plans: readonly BulkDayPlan[],
    userId: string
  ): Promise<CreatedReservation[]> {
    const data = plans.flatMap((plan) =>
      plan.outcome === 'SPOT_ASSIGNED'
        ? [{ parkingSpotId: plan.parkingSpotId, userId, date: toDateColumn(plan.date) }]
        : []
    );
    if (data.length === 0) {
      return [];
    }

    return tx.reservation.createManyAndReturn({
      data,
      skipDuplicates: true,
      select: { id: true, parkingSpotId: true, userId: true, date: true, createdAt: true },
    });
  }

  /** Inserts the queue entries, skipping queues the caller is already in. */
  private async createWaitlistEntries(
    tx: Prisma.TransactionClient,
    targets: ReadonlyMap<DateOnly, QueueTarget>,
    userId: string
  ): Promise<QueueRow[]> {
    if (targets.size === 0) {
      return [];
    }

    const data = [...targets.entries()]
      .sort(([left], [right]) => compareDateOnly(left, right))
      .map(([date, spot]) => ({ parkingSpotId: spot.id, userId, date: toDateColumn(date) }));

    return tx.waitlistEntry.createManyAndReturn({
      data,
      skipDuplicates: true,
      select: { id: true, parkingSpotId: true, userId: true, date: true },
    });
  }

  // --- assembling the answer -------------------------------------------------

  private allocate(dates: readonly DateOnly[], world: World, userId: string): BulkDayPlan[] {
    return allocateBulk({
      dates,
      spots: world.spots,
      userId,
      preferredParkingSpotId: world.preferredParkingSpotId,
      stateByDate: world.stateByDate,
    });
  }

  /**
   * Which spot each still-unsatisfied day should queue for.
   *
   * Two sources: days the allocator already decided to queue, and days it wanted
   * to assign but whose cell was taken in the meantime — the brief's rule, "a
   * collision does not fail the batch, that day falls onto the waitlist". A day
   * the caller turns out to already hold a reservation on is deliberately **not**
   * here: they could never be promoted out of that queue.
   */
  private queueTargets(
    plans: readonly BulkDayPlan[],
    world: World,
    createdByDate: ReadonlyMap<DateOnly, CreatedReservation>,
    busyElsewhere: ReadonlySet<DateOnly>
  ): Map<DateOnly, QueueTarget> {
    const targets = new Map<DateOnly, QueueTarget>();

    for (const plan of plans) {
      if (plan.outcome === 'QUEUED') {
        targets.set(plan.date, { id: plan.parkingSpotId, label: plan.parkingSpotLabel });
        continue;
      }
      if (plan.outcome !== 'SPOT_ASSIGNED') {
        continue;
      }
      if (createdByDate.has(plan.date) || busyElsewhere.has(plan.date)) {
        continue;
      }
      // The cell was taken between the read and the insert. The same rule the
      // allocator uses picks the queue, from the same snapshot.
      const state = world.stateByDate.get(plan.date);
      const fallback = state === undefined ? undefined : shortestQueue(world.spots, state);
      if (fallback !== undefined) {
        targets.set(plan.date, { id: fallback.id, label: fallback.label });
      }
    }

    return targets;
  }

  /** One planned day, as it actually turned out. */
  private resolve(
    plan: BulkDayPlan,
    createdByDate: ReadonlyMap<DateOnly, CreatedReservation>,
    busyElsewhere: ReadonlySet<DateOnly>,
    targets: ReadonlyMap<DateOnly, QueueTarget>,
    queues: ReadonlyMap<string, readonly QueueRow[]>,
    userId: string
  ): BulkDayResult {
    if (plan.outcome === 'UNAVAILABLE') {
      return plan;
    }

    if (plan.outcome === 'SPOT_ASSIGNED') {
      const created = createdByDate.get(plan.date);
      if (created !== undefined) {
        return { ...plan, reservationId: created.id };
      }
      if (busyElsewhere.has(plan.date)) {
        // Somebody — another request of theirs, or a promotion — gave the caller
        // a reservation that day while this transaction was running. That is the
        // one-per-day rule, reported with the reason that names it.
        return { outcome: 'UNAVAILABLE', date: plan.date, reason: 'ALREADY_HAS_RESERVATION' };
      }
    }

    const target = targets.get(plan.date);
    if (target === undefined) {
      // Only reachable for a day with no spot to queue for at all, which the
      // allocator would already have reported as `NO_SPOTS_AVAILABLE`.
      return { outcome: 'UNAVAILABLE', date: plan.date, reason: 'NO_SPOTS_AVAILABLE' };
    }

    const queue = queues.get(cellKey(target.id, plan.date)) ?? [];
    const index = queue.findIndex((row) => row.userId === userId);
    const entry = queue[index];
    if (entry === undefined) {
      // The entry was either inserted by this transaction or was already there,
      // and both are visible to this read. Absent means a defect, and a defect
      // is better as a 500 than as a fabricated queue position.
      throw new Error(`No queue entry for ${userId} on ${plan.date} after inserting one.`);
    }

    return {
      outcome: 'QUEUED',
      date: plan.date,
      parkingSpotId: target.id,
      parkingSpotLabel: target.label,
      waitlistPosition: index + 1,
      waitlistEntryId: entry.id,
    };
  }

  private reservationAudit(
    created: readonly CreatedReservation[],
    actorUserId: string
  ): AuditEntry[] {
    return created.map((row) => ({
      actorUserId,
      action: 'RESERVATION_CREATED',
      entityType: 'Reservation',
      entityId: row.id,
      payload: { parkingSpotId: row.parkingSpotId, date: toDateOnly(row.date) },
    }));
  }

  private queueAudit(queued: readonly QueueRow[], actorUserId: string): AuditEntry[] {
    return queued.map((row) => ({
      actorUserId,
      action: 'WAITLIST_JOINED',
      entityType: 'WaitlistEntry',
      entityId: row.id,
      payload: { parkingSpotId: row.parkingSpotId, date: toDateOnly(row.date) },
    }));
  }

  /**
   * The plans, back in the order the client listed the days.
   *
   * The allocator works in ascending date order because that is the lock
   * ordering; the contract promises the response "in the order the days were
   * requested". Both are true, and this is the one line where they meet.
   */
  private inRequestOrder<T extends { date: DateOnly }>(
    requested: readonly DateOnly[],
    entries: readonly T[]
  ): T[] {
    const byDate = new Map(entries.map((entry) => [entry.date, entry]));
    return requested.flatMap((date) => {
      const entry = byDate.get(date);
      return entry === undefined ? [] : [entry];
    });
  }

  /**
   * The counts, off whichever of the two day shapes the caller has.
   *
   * `BulkDayPlan` rather than a union of both: every member of `BulkDayResult`
   * is a superset of the matching plan member — which is the property the
   * contract's comment says makes the two zip by `date` — so one function
   * summarises a proposal and a result alike, and the two can never disagree
   * about how a summary is counted.
   */
  private summarise(days: readonly BulkDayPlan[]): BulkBookingSummary {
    return {
      assigned: days.filter((day) => day.outcome === 'SPOT_ASSIGNED').length,
      queued: days.filter((day) => day.outcome === 'QUEUED').length,
      unavailable: days.filter((day) => day.outcome === 'UNAVAILABLE').length,
      preferredSpotHits: days.filter(
        (day) => day.outcome === 'SPOT_ASSIGNED' && day.isPreferredSpot
      ).length,
    };
  }

  // --- request-level rules ---------------------------------------------------

  /**
   * The two conditions that invalidate the **whole** request, and the sorted day
   * list everything downstream uses.
   *
   * A day in the past and a closed window are contract errors on the procedure;
   * a weekend, a holiday, a full day and a day the caller is already booked on
   * are per-day facts reported inside a successful response
   * (`doc/decision/0090-*`). The sort is why the error names the earliest
   * offending day rather than whichever one the client happened to list first.
   */
  private assertRequestable(
    dates: readonly DateOnly[],
    actor: AuthenticatedUser,
    settings: ReservationWindowSettings,
    today: DateOnly
  ): DateOnly[] {
    const sorted = [...dates].sort(compareDateOnly);
    if (sorted.length === 0) {
      throw new DomainError('VALIDATION_FAILED', {
        message: 'A bulk booking must name at least one day.',
      });
    }

    for (const date of sorted) {
      this.policy.assertNotInThePast(date, today);
      this.policy.assertWindowOpen(date, actor, settings, today);
    }
    return sorted;
  }

  /**
   * The single month the request covers.
   *
   * `bulkBookingInputSchema` already refuses a request that spans two months, so
   * on the wire this cannot fail. It is still checked, because the service is
   * also called directly and `month` is a claim about the whole batch: deriving
   * it from one day and hoping is how a response ends up describing a month it
   * does not cover.
   */
  private monthOf(dates: readonly DateOnly[]): string {
    const [first] = dates;
    if (first === undefined) {
      throw new DomainError('VALIDATION_FAILED', {
        message: 'A bulk booking must name at least one day.',
      });
    }
    const month = first.slice(0, 7);
    if (dates.some((date) => date.slice(0, 7) !== month)) {
      throw new DomainError('VALIDATION_FAILED', {
        message: 'A bulk booking must stay inside one calendar month.',
        details: { month },
      });
    }
    return month;
  }
}
