/**
 * The per-user, per-calendar-month cap on confirmed reservations.
 *
 * A request-time computation, not stored state: no new column, no migration.
 * Every path that inserts a `Reservation` row for a real user (never a guest —
 * a guest has no `userId`, so no budget applies) calls
 * `assertWithinMonthlyReservationCap` as the very last check before the
 * insert, inside the same transaction that will do the insert.
 *
 * The `pg_advisory_xact_lock` this takes is a new, disjoint lock resource: it
 * is never taken alongside, or before, any of the `FOR UPDATE`/`FOR SHARE` row
 * locks the reservation/waitlist services already use, and nothing that holds
 * it goes on to request one of those locks in the same transaction — so it
 * cannot form a new cycle with the deadlock `doc/decision/0065` documents.
 * Unlike the per-day rule (a real unique index, so an optimistic pre-check is
 * safe and `P2002` is the final arbiter), there is no constraint that could
 * reject an over-cap insert — the lock + recount inside it *is* the
 * authoritative check.
 */

import type { Prisma } from '@lets-park/database';
import { endOfMonth, startOfMonth, toYearMonth, type DateOnly } from '@lets-park/shared-types';
import { toDateColumn } from '../common/prisma-mapping';
import { DomainError } from '../common/errors/domain-error';

export const MONTHLY_RESERVATION_CAP = 5;

/**
 * Throws `DomainError('MONTHLY_RESERVATION_LIMIT_REACHED')` if `userId` already
 * holds `MONTHLY_RESERVATION_CAP - additional` or more confirmed reservations
 * in `date`'s calendar month. `additional` is how many more the caller is
 * about to insert in this same transaction (default 1; bulk confirm passes the
 * count of days it is about to assign).
 */
export async function assertWithinMonthlyReservationCap(
  tx: Prisma.TransactionClient,
  userId: string,
  date: DateOnly,
  additional = 1
): Promise<void> {
  const month = toYearMonth(date);
  await lockUserMonth(tx, userId, month);

  const count = await tx.reservation.count({
    where: {
      userId,
      date: { gte: toDateColumn(startOfMonth(date)), lte: toDateColumn(endOfMonth(date)) },
    },
  });

  if (count + additional > MONTHLY_RESERVATION_CAP) {
    throw new DomainError('MONTHLY_RESERVATION_LIMIT_REACHED', {
      details: { month, limit: MONTHLY_RESERVATION_CAP },
    });
  }
}

/**
 * `hashtextextended` rather than `hashtext`: `pg_advisory_xact_lock` takes a
 * `bigint`, and `hashtext` only returns `int4`. The seed argument (`0`) is
 * fixed — it only has to be consistent between calls, not secret.
 *
 * `$executeRaw` rather than `$queryRaw`: `pg_advisory_xact_lock` returns
 * `void`, and Prisma's raw-result deserializer rejects that column type
 * (`Failed to deserialize column of type 'void'`). `$executeRaw` still runs the
 * statement and still blocks until the lock is acquired — it just does not try
 * to read a result set back — and `monthly-reservation-cap.db.spec.ts`
 * (`serializes two callers …`) asserts against a real PostgreSQL that a second
 * transaction really does block on it, not merely that this compiles.
 */
async function lockUserMonth(
  tx: Prisma.TransactionClient,
  userId: string,
  month: string
): Promise<void> {
  const key = `${userId}:${month}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
