/**
 * Bulk booking against a real PostgreSQL 17 — the sequential half.
 *
 * The races are in `bulk-concurrency.db.spec.ts`. What is here is everything a
 * single caller can observe: that the preview writes nothing, that the
 * confirmation writes reservations, queue entries, audit rows and broadcasts,
 * that the window and the past-date rules reject the whole request while a
 * weekend rejects only its own day, and — with a forced interleaving — that a
 * day whose spot is taken mid-transaction falls onto the waitlist instead of
 * discarding the batch.
 *
 * ## Why the fixtures look the way they do
 *
 * **Spots are global.** The database is shared by every `*.db.spec.ts` in the
 * run, and a spot another suite seeded is an active spot this allocator will
 * consider. So nothing here asserts *which* spot was picked out of the whole
 * lot: it asserts the two things that really are this module's claims — that the
 * row the result names exists in the database with the fields the result gave
 * it, and that the preview and the confirmation agree with each other. Where one
 * specific spot has to win, it is made to win by a rule that beats the ordering
 * outright: the caller's `preferredParkingSpotId`. Which spot the *ordering*
 * picks is `bulk-allocator.spec.ts`'s subject, where it can be settled without a
 * database at all.
 *
 * **Days are not shared between cases.** Several cases fill a whole day or book
 * one, so each gets days of its own; a case that reused another's would pass or
 * fail depending on the order Jest happened to run them in. They all sit in
 * **January 2100**, a month nothing else in the suite touches, which also
 * happens to contain a weekday public holiday (`2100-01-01` is a Friday) — that
 * is what makes the `NOT_A_BUSINESS_DAY` case possible inside a single calendar
 * month, which the input schema requires.
 *
 * Run with `nx run api:test-db` after `docker compose --profile dev up -d`.
 */

import type { PrismaClient, User as UserRow } from '@lets-park/database';
import { Prisma } from '@lets-park/database';
import type { DateOnly } from '@lets-park/shared-types';
import { isBusinessDay } from '@lets-park/shared-types';
import { mapPrismaErrorCode } from '../common/filters/contract-exception.filter';
import { DomainError } from '../common/errors/domain-error';
import { toDateColumn } from '../common/prisma-mapping';
import type { Harness } from '../testing/database/reservation-harness';
import {
  TODAY,
  actorFor,
  buildHarness,
  connect,
  holdTransaction,
  seedSpot,
  seedUser,
  setLockMode,
  setPreferredSpot,
  waitForBlockedBackend,
} from '../testing/database/reservation-harness';

/** New Year's Day 2100 — a **Friday**, so a holiday that is not a weekend. */
const HOLIDAY = '2100-01-01' as DateOnly;
/** The Saturday after it. */
const WEEKEND = '2100-01-02' as DateOnly;

/** Read-only cases may share these; nothing writes to them. */
const PREVIEW_DAYS = ['2100-01-04', '2100-01-05', '2100-01-06'] as DateOnly[];
/** Days for cases that only ever get rejected. */
const REJECTED_DAY = '2100-01-07' as DateOnly;
/** The one day the locked-month case lets an admin book. */
const ADMIN_DAY = '2100-01-08' as DateOnly;
const CONFIRM_DAYS = ['2100-01-11', '2100-01-12', '2100-01-13'] as DateOnly[];
const PARITY_DAYS = ['2100-01-14', '2100-01-15'] as DateOnly[];
const ALREADY_BOOKED_DAYS = ['2100-01-18', '2100-01-19'] as DateOnly[];
const FULL_DAY = '2100-01-20' as DateOnly;
const QUEUED_BEHIND_DAY = '2100-01-21' as DateOnly;
const AFTER_COMMIT_DAY = '2100-01-22' as DateOnly;
const CONTESTED_DAYS = ['2100-01-25', '2100-01-26'] as DateOnly[];

/** Every day this file names, for the fixture guard. */
const BUSINESS_DAYS = [
  ...PREVIEW_DAYS,
  REJECTED_DAY,
  ADMIN_DAY,
  ...CONFIRM_DAYS,
  ...PARITY_DAYS,
  ...ALREADY_BOOKED_DAYS,
  FULL_DAY,
  QUEUED_BEHIND_DAY,
  AFTER_COMMIT_DAY,
  ...CONTESTED_DAYS,
];

/** The code a rejected call carried, whether it came from us or from Postgres. */
async function codeOf(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    if (error instanceof DomainError) {
      return error.code;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return mapPrismaErrorCode(error) ?? `unmapped ${error.code}`;
    }
    throw error;
  }
  throw new Error('Expected this call to be rejected, but it succeeded.');
}

describe('bulk booking against a real PostgreSQL', () => {
  let client: PrismaClient;
  /** A second pool, for the one case that needs an uncommitted competitor. */
  let otherClient: PrismaClient;
  let harness: Harness;
  let user: UserRow;

  /** Row counts of everything a preview must not touch. */
  async function counts(): Promise<{ reservations: number; waitlist: number; audit: number }> {
    const [reservations, waitlist, audit] = await Promise.all([
      client.reservation.count(),
      client.waitlistEntry.count(),
      client.auditLog.count(),
    ]);
    return { reservations, waitlist, audit };
  }

  /**
   * Gives every active spot to somebody else for `date`.
   *
   * The only honest way to reach the `QUEUED` branch while other suites keep
   * adding spots to the same database: "the lot is full" has to be true of the
   * whole lot, not of the two spots this file happened to seed.
   */
  async function fillTheLot(date: DateOnly): Promise<{ id: string; label: string }[]> {
    const spots = await client.parkingSpot.findMany({
      where: { active: true },
      select: { id: true, label: true },
    });
    await Promise.all(
      spots.map(async (spot) => {
        const holder = await seedUser(client);
        await client.reservation.create({
          data: { parkingSpotId: spot.id, userId: holder.id, date: toDateColumn(date) },
        });
      })
    );
    return spots;
  }

  beforeAll(async () => {
    client = connect();
    otherClient = connect();
    harness = buildHarness(client);
    // At least one spot of our own, so the lot is never empty for these cases.
    await seedSpot(client);
    user = await seedUser(client);
  });

  afterAll(async () => {
    await Promise.all([client.$disconnect(), otherClient.$disconnect()]);
  });

  beforeEach(async () => {
    harness.publisher.reset();
    // 2100-01 is far outside the automatic window, so every case that is not
    // *about* the window forces it open. `monthLockState` is still the only
    // implementation of the rule; this only chooses which branch of it applies.
    await setLockMode(client, 'FORCE_OPEN');
    await setPreferredSpot(client, user.id, null);
  });

  it('uses fixture days that mean what the cases below assume', () => {
    // Without this, "skipped for the holiday" and "skipped for the weekend"
    // would be indistinguishable, and a January that turned out to be all
    // business days would make two cases vacuous.
    expect(isBusinessDay(HOLIDAY)).toBe(false);
    expect(isBusinessDay(WEEKEND)).toBe(false);
    for (const date of BUSINESS_DAYS) {
      expect(isBusinessDay(date)).toBe(true);
    }
    // The input schema requires one calendar month, so every fixture is in one.
    expect(new Set([...BUSINESS_DAYS, HOLIDAY, WEEKEND].map((date) => date.slice(0, 7)))).toEqual(
      new Set(['2100-01'])
    );
    // And no case borrows another's day, which is what keeps them independent
    // of the order Jest runs them in.
    expect(new Set(BUSINESS_DAYS).size).toBe(BUSINESS_DAYS.length);
  });

  describe('previewBulk', () => {
    it('writes nothing at all — no reservation, no queue entry, no audit row', async () => {
      const before = await counts();

      const preview = await harness.bulk.preview({ dates: PREVIEW_DAYS }, actorFor(user), TODAY);

      expect(preview.days).toHaveLength(PREVIEW_DAYS.length);
      expect(await counts()).toEqual(before);
      // And nothing was broadcast either: a proposal is not a fact.
      expect(harness.publisher.events).toEqual([]);
    });

    it('gives the same answer for the same input, twice', async () => {
      const first = await harness.bulk.preview({ dates: PREVIEW_DAYS }, actorFor(user), TODAY);
      const second = await harness.bulk.preview({ dates: PREVIEW_DAYS }, actorFor(user), TODAY);

      expect(second).toEqual(first);
    });

    it('answers in the order the days were requested, not in date order', async () => {
      const requested = [PREVIEW_DAYS[2], PREVIEW_DAYS[0], PREVIEW_DAYS[1]] as DateOnly[];

      const preview = await harness.bulk.preview({ dates: requested }, actorFor(user), TODAY);

      expect(preview.days.map((day) => day.date)).toEqual(requested);
      expect(preview.month).toBe('2100-01');
    });

    it('proposes the caller’s preferred spot and says so', async () => {
      const preferred = await seedSpot(client);
      await setPreferredSpot(client, user.id, preferred.id);

      const preview = await harness.bulk.preview(
        { dates: [PREVIEW_DAYS[0] as DateOnly] },
        actorFor(user),
        TODAY
      );

      expect(preview.preferredParkingSpotId).toBe(preferred.id);
      expect(preview.days[0]).toEqual({
        outcome: 'SPOT_ASSIGNED',
        date: PREVIEW_DAYS[0],
        parkingSpotId: preferred.id,
        parkingSpotLabel: preferred.label,
        isPreferredSpot: true,
      });
      expect(preview.summary).toEqual({
        assigned: 1,
        queued: 0,
        unavailable: 0,
        preferredSpotHits: 1,
      });
    });

    it('marks a weekend and a holiday unavailable without discarding the rest', async () => {
      const preview = await harness.bulk.preview(
        { dates: [HOLIDAY, WEEKEND, PREVIEW_DAYS[0] as DateOnly] },
        actorFor(user),
        TODAY
      );

      expect(preview.days.map((day) => [day.date, day.outcome])).toEqual([
        [HOLIDAY, 'UNAVAILABLE'],
        [WEEKEND, 'UNAVAILABLE'],
        [PREVIEW_DAYS[0], 'SPOT_ASSIGNED'],
      ]);
      expect(preview.days.slice(0, 2).map((day) => 'reason' in day && day.reason)).toEqual([
        'NOT_A_BUSINESS_DAY',
        'NOT_A_BUSINESS_DAY',
      ]);
      expect(preview.summary.unavailable).toBe(2);
    });
  });

  describe('the rules that reject the whole request', () => {
    it('refuses a past day', async () => {
      const past = ['2098-01-06'] as DateOnly[];

      await expect(
        codeOf(harness.bulk.preview({ dates: past }, actorFor(user), TODAY))
      ).resolves.toBe('PAST_DATE');
      await expect(
        codeOf(harness.bulk.confirm({ dates: past }, actorFor(user), TODAY))
      ).resolves.toBe('PAST_DATE');
    });

    it('refuses a month that has not opened yet', async () => {
      await setLockMode(client, 'AUTO');

      await expect(
        codeOf(harness.bulk.confirm({ dates: [REJECTED_DAY] }, actorFor(user), TODAY))
      ).resolves.toBe('OUT_OF_HORIZON');
    });

    it('refuses a normal user in a locked month, and lets an admin through', async () => {
      await setLockMode(client, 'FORCE_LOCKED');

      await expect(
        codeOf(harness.bulk.confirm({ dates: [ADMIN_DAY] }, actorFor(user), TODAY))
      ).resolves.toBe('RESERVATIONS_LOCKED');
      expect(
        await client.reservation.count({
          where: { userId: user.id, date: toDateColumn(ADMIN_DAY) },
        })
      ).toBe(0);

      const admin = await seedUser(client);
      const result = await harness.bulk.confirm(
        { dates: [ADMIN_DAY] },
        actorFor(admin, 'ADMIN'),
        TODAY
      );

      expect(result.summary.assigned).toBe(1);
    });

    it('refuses a request that spans two months', async () => {
      // `bulkBookingInputSchema` refuses this on the wire; the service checks it
      // too, because `month` is a claim about the whole batch.
      await expect(
        codeOf(
          harness.bulk.preview(
            { dates: [REJECTED_DAY, '2100-02-01' as DateOnly] },
            actorFor(user),
            TODAY
          )
        )
      ).resolves.toBe('VALIDATION_FAILED');
    });
  });

  describe('confirmBulk', () => {
    it('writes a reservation, an audit entry and a broadcast for every assigned day', async () => {
      const booker = await seedUser(client);

      const result = await harness.bulk.confirm({ dates: CONFIRM_DAYS }, actorFor(booker), TODAY);

      expect(result.summary).toMatchObject({ assigned: 3, queued: 0, unavailable: 0 });

      for (const day of result.days) {
        if (day.outcome !== 'SPOT_ASSIGNED') {
          throw new Error(`Expected ${day.date} to be assigned, got ${day.outcome}.`);
        }
        // The row the result names really exists, on the day and spot it names.
        const stored = await client.reservation.findUniqueOrThrow({
          where: { id: day.reservationId },
        });
        expect(stored).toMatchObject({ userId: booker.id, parkingSpotId: day.parkingSpotId });
        expect(stored.date.toISOString()).toBe(`${day.date}T00:00:00.000Z`);

        const audit = await client.auditLog.findMany({ where: { entityId: day.reservationId } });
        expect(audit.map((row) => row.action)).toEqual(['RESERVATION_CREATED']);
        expect(audit[0]?.actorUserId).toBe(booker.id);
      }

      expect(
        harness.publisher.ofKind('reservation:created').map((event) => event.payload.date)
      ).toEqual(CONFIRM_DAYS);
      expect(harness.publisher.ofKind('waitlist:updated')).toEqual([]);
    });

    it('does what the preview proposed, day for day', async () => {
      const booker = await seedUser(client);
      const preferred = await seedSpot(client);
      await setPreferredSpot(client, booker.id, preferred.id);

      const preview = await harness.bulk.preview({ dates: PARITY_DAYS }, actorFor(booker), TODAY);
      const result = await harness.bulk.confirm({ dates: PARITY_DAYS }, actorFor(booker), TODAY);

      expect(result.days.map((day) => [day.date, day.outcome])).toEqual(
        preview.days.map((day) => [day.date, day.outcome])
      );
      expect(result.days.map((day) => ('parkingSpotId' in day ? day.parkingSpotId : null))).toEqual(
        preview.days.map((day) => ('parkingSpotId' in day ? day.parkingSpotId : null))
      );
      expect(result.summary).toEqual(preview.summary);
      expect(result.summary.preferredSpotHits).toBe(2);
    });

    it('skips a day the caller already holds a reservation on', async () => {
      const booker = await seedUser(client);
      const spot = await seedSpot(client);
      const [taken, free] = ALREADY_BOOKED_DAYS as [DateOnly, DateOnly];
      await client.reservation.create({
        data: { parkingSpotId: spot.id, userId: booker.id, date: toDateColumn(taken) },
      });

      const result = await harness.bulk.confirm({ dates: [taken, free] }, actorFor(booker), TODAY);

      expect(result.days[0]).toEqual({
        outcome: 'UNAVAILABLE',
        date: taken,
        reason: 'ALREADY_HAS_RESERVATION',
      });
      expect(result.days[1]?.outcome).toBe('SPOT_ASSIGNED');
      // Still exactly one reservation that day, and in particular they were not
      // put into a queue they could never be promoted out of.
      expect(
        await client.reservation.count({ where: { userId: booker.id, date: toDateColumn(taken) } })
      ).toBe(1);
      expect(
        await client.waitlistEntry.count({
          where: { userId: booker.id, date: toDateColumn(taken) },
        })
      ).toBe(0);
    });

    it('queues, audits and broadcasts when the whole lot is taken', async () => {
      const spots = await fillTheLot(FULL_DAY);
      const booker = await seedUser(client);

      const result = await harness.bulk.confirm({ dates: [FULL_DAY] }, actorFor(booker), TODAY);

      const queued = result.days[0];
      if (queued?.outcome !== 'QUEUED') {
        throw new Error(`Expected ${FULL_DAY} to be queued, got ${queued?.outcome}.`);
      }
      expect(spots.map((spot) => spot.id)).toContain(queued.parkingSpotId);
      expect(queued.waitlistPosition).toBe(1);
      expect(result.summary).toEqual({
        assigned: 0,
        queued: 1,
        unavailable: 0,
        preferredSpotHits: 0,
      });

      const entry = await client.waitlistEntry.findUniqueOrThrow({
        where: { id: queued.waitlistEntryId },
      });
      expect(entry).toMatchObject({ userId: booker.id, parkingSpotId: queued.parkingSpotId });

      const audit = await client.auditLog.findMany({ where: { entityId: queued.waitlistEntryId } });
      expect(audit.map((row) => row.action)).toEqual(['WAITLIST_JOINED']);
      expect(audit[0]?.entityType).toBe('WaitlistEntry');

      expect(harness.publisher.ofKind('waitlist:updated')).toEqual([
        {
          name: 'waitlist:updated',
          payload: { date: FULL_DAY, parkingSpotId: queued.parkingSpotId, waitlistCount: 1 },
        },
      ]);
      expect(harness.publisher.ofKind('reservation:created')).toEqual([]);
    });

    it('reports the position behind everybody already queued', async () => {
      const spots = await fillTheLot(QUEUED_BEHIND_DAY);
      // Two people ahead in *every* queue, so whichever spot the allocator picks
      // the answer is the same and this case is not secretly about the choice.
      await Promise.all(
        spots.flatMap((spot) =>
          [0, 1].map(async () => {
            const waiter = await seedUser(client);
            await client.waitlistEntry.create({
              data: {
                parkingSpotId: spot.id,
                userId: waiter.id,
                date: toDateColumn(QUEUED_BEHIND_DAY),
              },
            });
          })
        )
      );
      const booker = await seedUser(client);

      const result = await harness.bulk.confirm(
        { dates: [QUEUED_BEHIND_DAY] },
        actorFor(booker),
        TODAY
      );

      expect(result.days[0]).toMatchObject({ outcome: 'QUEUED', waitlistPosition: 3 });
    });

    it('publishes only once the transaction has committed', async () => {
      const booker = await seedUser(client);

      // A **second connection**, which by definition cannot see uncommitted
      // rows. If `publish` ran inside the transaction, this observer would find
      // no reservation at all.
      const observer = connect();
      const seen: boolean[] = [];
      let probe: Promise<void> = Promise.resolve();
      harness.publisher.onPublish = () => {
        probe = (async () => {
          const stored = await observer.reservation.count({
            where: { userId: booker.id, date: toDateColumn(AFTER_COMMIT_DAY) },
          });
          seen.push(stored === 1);
        })();
      };

      try {
        await harness.bulk.confirm({ dates: [AFTER_COMMIT_DAY] }, actorFor(booker), TODAY);
        await probe;

        expect(seen).toEqual([true]);
      } finally {
        await observer.$disconnect();
      }
    });
  });

  describe('a day whose spot is taken mid-transaction', () => {
    /**
     * The partial-failure rule, forced rather than hoped for.
     *
     * A competitor writes a reservation for the spot the preview just proposed
     * and **holds it uncommitted**. The confirmation's own read cannot see that
     * row, so it plans the same spot, and its `INSERT … ON CONFLICT DO NOTHING`
     * blocks on the uncommitted key. Releasing the competitor turns that block
     * into a *skipped row* rather than a `P2002`: the transaction survives, that
     * one day falls onto the waitlist for the spot it lost, and the other day is
     * still assigned.
     *
     * Drop `skipDuplicates` and the whole batch comes back
     * `SPOT_ALREADY_RESERVED` having written nothing. The task report has that
     * failure.
     */
    it('falls onto the waitlist for that spot and keeps the rest of the batch', async () => {
      const booker = await seedUser(client);
      const competitor = await seedUser(client);
      const [contested, spare] = CONTESTED_DAYS as [DateOnly, DateOnly];

      // Learn which spot the allocator will choose, without writing anything.
      const preview = await harness.bulk.preview(
        { dates: [contested, spare] },
        actorFor(booker),
        TODAY
      );
      const planned = preview.days[0];
      if (planned?.outcome !== 'SPOT_ASSIGNED') {
        throw new Error(`Expected the preview to assign ${contested}, got ${planned?.outcome}.`);
      }
      harness.publisher.reset();

      const held = holdTransaction(otherClient, (tx) =>
        tx.reservation.create({
          data: {
            parkingSpotId: planned.parkingSpotId,
            userId: competitor.id,
            date: toDateColumn(contested),
          },
        })
      );
      await held.ready;

      const confirming = harness.bulk.confirm(
        { dates: [contested, spare] },
        actorFor(booker),
        TODAY
      );
      // Proves the insert really is stuck on the competitor's uncommitted key
      // rather than having sailed past it. Throws if nothing ever blocks.
      await waitForBlockedBackend(client);

      held.release();
      await held.done;
      const result = await confirming;

      expect(result.summary).toMatchObject({ assigned: 1, queued: 1, unavailable: 0 });

      const lost = result.days[0];
      if (lost?.outcome !== 'QUEUED') {
        throw new Error(`Expected ${contested} to be queued, got ${lost?.outcome}.`);
      }
      // Queued for the spot it lost — the one spot on that day this transaction
      // knows for certain is occupied.
      expect(lost.parkingSpotId).toBe(planned.parkingSpotId);
      expect(lost.waitlistPosition).toBe(1);
      await expect(
        client.waitlistEntry.findUniqueOrThrow({ where: { id: lost.waitlistEntryId } })
      ).resolves.toMatchObject({ userId: booker.id, parkingSpotId: planned.parkingSpotId });

      // The competitor kept the contested cell, and the batch kept the other day.
      const contestedRow = await client.reservation.findUniqueOrThrow({
        where: {
          parkingSpotId_date: {
            parkingSpotId: planned.parkingSpotId,
            date: toDateColumn(contested),
          },
        },
      });
      expect(contestedRow.userId).toBe(competitor.id);
      expect(result.days[1]?.outcome).toBe('SPOT_ASSIGNED');
      expect(
        await client.reservation.count({ where: { userId: booker.id, date: toDateColumn(spare) } })
      ).toBe(1);
      expect(
        await client.reservation.count({
          where: { userId: booker.id, date: toDateColumn(contested) },
        })
      ).toBe(0);
    });
  });
});
