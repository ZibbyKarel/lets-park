/**
 * Auto-promotion: handing a freed spot to the first person queued for it.
 *
 * This runs **inside** the caller's transaction — it takes a
 * `Prisma.TransactionClient`, never `PrismaService` — because the promotion and
 * the cancellation that freed the spot have to share a fate. A promotion that
 * committed while its cancellation rolled back would hand out a spot somebody
 * still holds; a cancellation that committed while its promotion rolled back
 * would silently skip the queue.
 *
 * ## Why a row lock, and what exactly it prevents
 *
 * The queue is read with `SELECT … FOR UPDATE` through `$queryRaw`, ordered by
 * `createdAt` then `id` — the same order `DayOverviewService` shows people as
 * their position, so the number in the UI is the number that gets promoted.
 *
 * The lock is not there to stop two promotions of the same spot: two
 * reservations for one spot and day cannot coexist (unique index), so two
 * cancellations of the same cell cannot be in flight at once. It is there for
 * the race against **`waitlist.leave`**:
 *
 * ```
 * T1 cancel+promote                     T2 leave (W1)
 * ─────────────────────────             ─────────────────────────
 * read queue → [W1, W2]
 *                                       DELETE W1's entry
 *                                       COMMIT
 * INSERT reservation for W1   ← W1 is given a spot they opted out of
 * ```
 *
 * With `FOR UPDATE`, T2's `DELETE` blocks on the row T1 has locked until T1
 * commits, and then deletes nothing (the promotion already removed it), so T2
 * answers `NOT_FOUND` — which is the truth: they were promoted before they left.
 * If T2 gets there first, T1's locking read simply never sees the row and W2 is
 * promoted instead. Both orderings are correct; without the lock the first one
 * is not. `waitlist-concurrency.db.spec.ts` ("the row lock on the queue") drives
 * exactly this interleaving with two real transactions and a barrier, and the
 * mutation result — `FOR UPDATE` deleted, the departed waiter promoted, the test
 * red — is pasted in the task report.
 *
 * ## The candidate the queue may not give
 *
 * "First in line" is not enough: a person may hold a reservation elsewhere that
 * same day, and promoting them would break the one-reservation-per-user-per-day
 * rule. Such a candidate is **skipped**, not failed — the spot goes to the next
 * person. Their queue entry is deliberately left in place: they are still
 * legitimately waiting for *this* spot in case their other reservation goes
 * away.
 *
 * That check is a read, and a read cannot be made race-free against a concurrent
 * `INSERT` of a row that does not exist yet — Postgres has no predicate lock
 * outside `SERIALIZABLE`. So the unique index on `Reservation (userId, date)` is
 * the real arbiter, it raises `P2002`, and `ReservationsService.cancel` retries
 * the whole transaction. See its comment for why the retry terminates.
 */

import { Injectable } from '@nestjs/common';
import type { Prisma, Reservation as ReservationRow } from '@lets-park/database';
import type { DateOnly } from '@lets-park/shared-types';
import { AuditLogService } from '../audit/audit-log.service';
import { toDateColumn } from '../common/prisma-mapping';

/** One queued person, as the locking read returns them. */
interface QueueRow {
  id: string;
  userId: string;
}

/** The holder fields a `publicReservation` needs. Nothing else may be exposed. */
export interface PromotedUser {
  id: string;
  name: string;
  licensePlate: string | null;
}

/** What a successful promotion produced, for the caller's after-commit events. */
export interface Promotion {
  reservation: ReservationRow;
  /** The queue entry that was consumed. Clients drop it by id. */
  waitlistEntryId: string;
  user: PromotedUser;
  /**
   * Every spot whose queue for this day lost a row, **including** the spot that
   * was freed.
   *
   * A promotion deletes all of the promoted person's entries for the day, not
   * just the one it consumed, so it can shorten queues on cells the caller never
   * named. Those cells are returned rather than kept private because a queue
   * that got shorter and told nobody is a badge that stays wrong on every open
   * day view until an unrelated event forces a refetch — the caller emits one
   * `waitlist:updated` per cell in here.
   */
  clearedParkingSpotIds: string[];
}

@Injectable()
export class WaitlistPromotionService {
  constructor(private readonly audit: AuditLogService) {}

  /**
   * Gives the freed cell to the first eligible person queued for it.
   *
   * @param tx      the open transaction; **must** be the one that freed the spot
   * @param actorUserId whoever's request triggered this, for the audit entry —
   *                    `AuditLog.actorUserId` is a non-null FK and there is no
   *                    "system" user row to point at
   * @returns the promotion, or `null` for an empty queue / nobody eligible, in
   *          which case the spot correctly stays free
   */
  async promote(
    tx: Prisma.TransactionClient,
    parkingSpotId: string,
    date: DateOnly,
    actorUserId: string
  ): Promise<Promotion | null> {
    const queue = await this.lockQueue(tx, parkingSpotId, date);
    if (queue.length === 0) {
      return null;
    }

    const candidate = await this.firstEligible(tx, queue, date);
    if (candidate === undefined) {
      return null;
    }

    const dateColumn = toDateColumn(date);
    const reservation = await tx.reservation.create({
      data: { parkingSpotId, userId: candidate.userId, date: dateColumn },
    });

    // Every queue entry this person holds for this day, not just the one that
    // was consumed: they have their spot, and a promotion out of a second queue
    // on the same day could not be honoured anyway (one reservation per day).
    //
    // `DELETE … RETURNING` rather than `deleteMany`, which reports only a count:
    // the caller has to name the cells whose queues just got shorter, and only
    // the delete itself knows which they were.
    const cleared = await tx.$queryRaw<{ parkingSpotId: string }[]>`
      DELETE FROM "WaitlistEntry"
      WHERE "userId" = ${candidate.userId}::uuid
        AND "date" = ${date}::date
      RETURNING "parkingSpotId"
    `;

    const user = await this.holder(tx, candidate.userId);

    await this.audit.record(
      {
        actorUserId,
        action: 'WAITLIST_PROMOTED',
        entityType: 'Reservation',
        entityId: reservation.id,
        payload: {
          parkingSpotId,
          date,
          promotedUserId: candidate.userId,
          fromWaitlistEntryId: candidate.id,
          queueLength: queue.length,
        },
      },
      tx
    );

    return {
      reservation,
      waitlistEntryId: candidate.id,
      user,
      clearedParkingSpotIds: [...new Set(cleared.map((row) => row.parkingSpotId))],
    };
  }

  /** The queue for one cell, in promotion order, with every row locked. */
  private async lockQueue(
    tx: Prisma.TransactionClient,
    parkingSpotId: string,
    date: DateOnly
  ): Promise<QueueRow[]> {
    // `$queryRaw` rather than `findMany`: Prisma's query API cannot express
    // `FOR UPDATE`, and the lock is the point of this read. The casts are
    // explicit because both parameters arrive as strings — `::date` in
    // particular keeps the day a calendar day and out of reach of the server's
    // `TimeZone` setting, which a bound `timestamptz` would not be.
    return tx.$queryRaw<QueueRow[]>`
      SELECT "id", "userId"
      FROM "WaitlistEntry"
      WHERE "parkingSpotId" = ${parkingSpotId}::uuid
        AND "date" = ${date}::date
      ORDER BY "createdAt" ASC, "id" ASC
      FOR UPDATE
    `;
  }

  /**
   * The first person in the queue who does not already hold a reservation that
   * day.
   *
   * One query for the whole queue rather than one per candidate: the queue is
   * already in memory and locked, and N round trips inside a transaction holding
   * row locks is exactly the thing this task is supposed to keep short.
   */
  private async firstEligible(
    tx: Prisma.TransactionClient,
    queue: readonly QueueRow[],
    date: DateOnly
  ): Promise<QueueRow | undefined> {
    const taken = await tx.reservation.findMany({
      where: { date: toDateColumn(date), userId: { in: queue.map((row) => row.userId) } },
      select: { userId: true },
    });
    const blocked = new Set(taken.map((row) => row.userId));

    return queue.find((row) => !blocked.has(row.userId));
  }

  /** The three fields a `userSummary` may carry. Never `select: undefined`. */
  private async holder(tx: Prisma.TransactionClient, userId: string): Promise<PromotedUser> {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, licensePlate: true },
    });
    return user;
  }
}
