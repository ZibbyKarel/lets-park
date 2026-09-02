/**
 * Two bulk bookings at once. Real transactions, real unique keys, real
 * deadlocks.
 *
 * A bulk confirmation holds up to 31 uncommitted `(parkingSpotId, date)` keys at
 * a time, which is Task 13's deadlock risk multiplied by the size of the batch.
 * What keeps it from being a problem is one line in `bulk-allocator.ts` — the
 * ascending sort — and this file is where that line stops being an argument:
 *
 * - **the brief's case**: two users booking *the same days in opposite request
 *   order* both succeed, and the database agrees with what each of them was
 *   told;
 * - **the cycle itself**: a competitor that takes the same two cells in the
 *   opposite order really does deadlock against a confirmation, and when it
 *   happens the batch is all-or-nothing and the caller is told `CONFLICT`
 *   rather than being handed a 500.
 *
 * The second case is what makes the first one meaningful. Without it "both
 * succeeded" could just mean the two requests never met.
 *
 * The days are in **February 2100**, which nothing else in the suite touches,
 * for the same reason `bulk-reservation.db.spec.ts` uses January: spots are
 * global in this database but days do not have to be.
 */

import type { PrismaClient } from '@lets-park/database';
import { Prisma } from '@lets-park/database';
import type { ConfirmBulkOutput } from '@lets-park/contract';
import type { DateOnly } from '@lets-park/shared-types';
import { isBusinessDay } from '@lets-park/shared-types';
import { mapPrismaErrorCode } from '../common/filters/contract-exception.filter';
import { DomainError } from '../common/errors/domain-error';
import { toDateColumn } from '../common/prisma-mapping';
import type { Harness } from '../testing/database/reservation-harness';
import {
  TODAY,
  actorFor,
  barrier,
  buildHarness,
  connect,
  seedSpot,
  seedUser,
  setLockMode,
  waitForBlockedBackend,
} from '../testing/database/reservation-harness';

/** Monday to Wednesday of the first full week of February 2100. */
const OPPOSITE_DAYS = ['2100-02-01', '2100-02-02', '2100-02-03'] as DateOnly[];
/** Thursday and Friday of the same week, for the deadlock case. */
const DEADLOCK_DAYS = ['2100-02-04', '2100-02-05'] as DateOnly[];

/** The contract code behind a rejected settlement, whatever kind of error it is. */
function codeOfRejection(outcome: PromiseSettledResult<unknown>): string {
  if (outcome.status === 'fulfilled') {
    throw new Error('Expected this call to have been rejected.');
  }
  const error: unknown = outcome.reason;
  if (error instanceof DomainError) {
    return error.code;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return mapPrismaErrorCode(error) ?? `unmapped ${error.code}`;
  }
  throw error;
}

describe('two bulk bookings at once', () => {
  let client: PrismaClient;
  /** A second pool, so the two sides of a race are genuinely separate sessions. */
  let otherClient: PrismaClient;
  let harness: Harness;
  let otherHarness: Harness;

  beforeAll(async () => {
    client = connect();
    otherClient = connect();
    harness = buildHarness(client);
    otherHarness = buildHarness(otherClient);
    // At least one spot of our own, so the lot is never empty.
    await seedSpot(client);
  });

  afterAll(async () => {
    await Promise.all([client.$disconnect(), otherClient.$disconnect()]);
  });

  beforeEach(async () => {
    harness.publisher.reset();
    otherHarness.publisher.reset();
    // February 2100 is far outside the automatic window; these cases are about
    // concurrency, not about the window.
    await setLockMode(client, 'FORCE_OPEN');
  });

  /**
   * Every day of a result really happened, exactly as the caller was told.
   *
   * Written as a check of the *result against the database* rather than against
   * an expected literal, because which of two racing callers wins is genuinely
   * not determined — but "what you were told is what is stored" is, and that is
   * the claim a user of this API depends on.
   */
  async function assertResultMatchesDatabase(
    result: ConfirmBulkOutput,
    userId: string
  ): Promise<void> {
    for (const day of result.days) {
      if (day.outcome === 'SPOT_ASSIGNED') {
        await expect(
          client.reservation.findUniqueOrThrow({ where: { id: day.reservationId } })
        ).resolves.toMatchObject({
          userId,
          parkingSpotId: day.parkingSpotId,
          date: toDateColumn(day.date),
        });
        continue;
      }
      if (day.outcome === 'QUEUED') {
        await expect(
          client.waitlistEntry.findUniqueOrThrow({ where: { id: day.waitlistEntryId } })
        ).resolves.toMatchObject({
          userId,
          parkingSpotId: day.parkingSpotId,
          date: toDateColumn(day.date),
        });
        continue;
      }
      // `UNAVAILABLE` means nothing was written for that day, in either table.
      expect(
        await client.reservation.count({ where: { userId, date: toDateColumn(day.date) } })
      ).toBe(0);
    }
  }

  it('uses fixture days that mean what the cases below assume', () => {
    for (const date of [...OPPOSITE_DAYS, ...DEADLOCK_DAYS]) {
      expect(isBusinessDay(date)).toBe(true);
    }
    // No case borrows another's day, so they stay independent of run order.
    expect(new Set([...OPPOSITE_DAYS, ...DEADLOCK_DAYS]).size).toBe(5);
  });

  describe('the same days, requested in opposite order', () => {
    it('lets both callers through and tells each of them the truth', async () => {
      const [first, second] = [await seedUser(client), await seedUser(client)];
      const forwards = OPPOSITE_DAYS;
      const backwards = [...OPPOSITE_DAYS].reverse();

      const outcomes = await Promise.allSettled([
        harness.bulk.confirm({ dates: forwards }, actorFor(first), TODAY),
        otherHarness.bulk.confirm({ dates: backwards }, actorFor(second), TODAY),
      ]);

      // Neither may fail. With the allocator's ascending sort removed the two
      // transactions take the same cells in opposite order and one of them comes
      // back `40P01 deadlock detected` — see the task report.
      expect(outcomes.map((outcome) => outcome.status)).toEqual(['fulfilled', 'fulfilled']);
      const [firstResult, secondResult] = outcomes.map((outcome) =>
        outcome.status === 'fulfilled' ? (outcome.value as ConfirmBulkOutput) : undefined
      );
      if (firstResult === undefined || secondResult === undefined) {
        throw new Error('Both confirmations were expected to have succeeded.');
      }

      expect(firstResult.days.map((day) => day.date)).toEqual(forwards);
      expect(secondResult.days.map((day) => day.date)).toEqual(backwards);
      await assertResultMatchesDatabase(firstResult, first.id);
      await assertResultMatchesDatabase(secondResult, second.id);

      for (const date of OPPOSITE_DAYS) {
        // The rule the unique indexes are there for: nobody holds two spots on
        // one day, and no cell was handed to two people.
        for (const user of [first, second]) {
          expect(
            await client.reservation.count({
              where: { userId: user.id, date: toDateColumn(date) },
            })
          ).toBeLessThanOrEqual(1);
        }
        const held = await client.reservation.findMany({
          where: { date: toDateColumn(date), userId: { in: [first.id, second.id] } },
          select: { parkingSpotId: true },
        });
        expect(new Set(held.map((row) => row.parkingSpotId)).size).toBe(held.length);
      }
    });
  });

  describe('a competitor that takes the same cells in the opposite order', () => {
    /**
     * The cycle, built by hand.
     *
     * The competitor is what an *unsorted* bulk confirmation would be: it takes
     * the later day first, waits, then reaches back for the earlier one. The
     * real confirmation takes them in ascending order, so:
     *
     * ```
     * confirmBulk                         competitor
     * INSERT (X, Feb 4)             ✓     INSERT (X, Feb 5)              ✓
     * INSERT (X, Feb 5) → waits on the competitor's uncommitted key
     *                                     INSERT (X, Feb 4) → waits on ours
     * ```
     *
     * PostgreSQL detects the cycle and kills one side. Which side is up to the
     * server — the backend whose lock wait times out first runs the detector and
     * aborts itself — so this asserts what is true either way: **somebody was
     * killed, the confirmation is all-or-nothing, and if it lost it lost with
     * `CONFLICT`** (`doc/decision/0065-*` maps `P2034`), never an unmapped 500.
     *
     * This is the failure mode the ascending sort exists to prevent, and it is
     * the reason the case above is not merely two requests that never met.
     */
    it('deadlocks, and the batch is all-or-nothing with a CONFLICT', async () => {
      const booker = await seedUser(client);
      const competitor = await seedUser(client);
      const [earlier, later] = DEADLOCK_DAYS as [DateOnly, DateOnly];

      // Which spot the confirmation will choose, learned without writing.
      const preview = await harness.bulk.preview(
        { dates: [earlier, later] },
        actorFor(booker),
        TODAY
      );
      const planned = preview.days[0];
      if (planned?.outcome !== 'SPOT_ASSIGNED') {
        throw new Error(`Expected the preview to assign ${earlier}, got ${planned?.outcome}.`);
      }
      const spotId = planned.parkingSpotId;

      const reached = barrier();
      const gate = barrier();

      const competing = otherClient
        .$transaction(
          async (tx) => {
            await tx.reservation.create({
              data: { parkingSpotId: spotId, userId: competitor.id, date: toDateColumn(later) },
            });
            reached.release();
            await gate.wait;
            // Reaching *back* for the earlier day is what closes the cycle.
            await tx.reservation.create({
              data: { parkingSpotId: spotId, userId: competitor.id, date: toDateColumn(earlier) },
            });
          },
          { maxWait: 10_000, timeout: 60_000 }
        )
        .then(() => undefined);
      await reached.wait;

      const confirming = harness.bulk.confirm({ dates: [earlier, later] }, actorFor(booker), TODAY);
      // The confirmation has taken the earlier day and is now stuck on the later
      // one. Throws if nothing ever blocks, so this cannot silently become a
      // test of two operations that ran in sequence.
      await waitForBlockedBackend(client);

      gate.release();
      const outcomes = await Promise.allSettled([confirming, competing]);

      // One of the two was killed by the deadlock detector. Both surviving would
      // mean the cycle never formed and this case proved nothing.
      expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);

      const [bulkOutcome] = outcomes;
      if (bulkOutcome === undefined) {
        throw new Error('No settlement for the confirmation.');
      }
      const heldByBooker = await client.reservation.count({
        where: { userId: booker.id, date: { in: DEADLOCK_DAYS.map(toDateColumn) } },
      });

      if (bulkOutcome.status === 'rejected') {
        // A deadlock is a lost race, not a defect: 409, not 500.
        expect(codeOfRejection(bulkOutcome)).toBe('CONFLICT');
        // And nothing survived it — no half-written batch, no orphan audit row.
        expect(heldByBooker).toBe(0);
        expect(
          await client.waitlistEntry.count({
            where: { userId: booker.id, date: { in: DEADLOCK_DAYS.map(toDateColumn) } },
          })
        ).toBe(0);
      } else {
        // The competitor lost instead; the whole batch went through.
        await assertResultMatchesDatabase(bulkOutcome.value, booker.id);
        expect(heldByBooker).toBe(2);
      }
    });
  });
});
