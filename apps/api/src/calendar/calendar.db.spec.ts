/**
 * The ICS feed's **queries**, against a real PostgreSQL 17.
 *
 * `calendar.service.spec.ts` runs against `PrismaDouble`, which is a model of
 * the database written by the same person who wrote the code it checks. That is
 * the exact arrangement that let `SPOT_ALREADY_RESERVED` be unreachable in
 * production while its unit tests were green (`database-contract.db.spec.ts`,
 * header). Two claims in the feed are of the same kind — statements about what
 * Prisma 7 with `@prisma/adapter-pg` does, not about our logic — and neither can
 * be settled by a double:
 *
 * 1. **`findFirst({ where: { icsToken, active: true } })` really resolves a
 *    token**, and really refuses a deactivated user. This is the whole
 *    authentication of a public endpoint.
 * 2. **A `@db.Date` column round-trips through `toDateOnly` unchanged**, on the
 *    days most likely to break it: the two Europe/Prague DST transitions and a
 *    leap day. `PrismaDouble` constructs those `Date` values itself, so it can
 *    only ever agree with the code.
 *
 * Same conventions as `database-contract.db.spec.ts`: part of `api:test-db`,
 * excluded from `api:test`, refuses to skip when `DATABASE_URL` is missing, and
 * every fixture lives inside a transaction that is always rolled back.
 */

import { Prisma } from '@lets-park/database';
import type { PrismaClient } from '@lets-park/database';
import { createPrismaClient } from '@lets-park/database';
import { toDateColumn, toDateOnly } from '../common/prisma-mapping';

function connectionString(): string {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url === '') {
    throw new Error(
      'DATABASE_URL is not set. This suite needs a real PostgreSQL — start it with ' +
        '`docker compose --profile dev up -d` and run `nx run api:test-db`. It does not ' +
        'skip itself, on purpose.'
    );
  }
  return url;
}

let counter = 0;
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}-calendar-db-${process.pid}-${counter}`;
}

/** Runs `work` in a transaction that is always rolled back, returning its value. */
async function inRolledBackTransaction<T>(
  prisma: PrismaClient,
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const marker = Symbol('rolled back');
  let result: T | undefined;
  let captured = false;
  try {
    await prisma.$transaction(async (tx) => {
      result = await work(tx);
      captured = true;
      throw marker;
    });
  } catch (error) {
    if (error !== marker) {
      throw error;
    }
  }
  if (!captured) {
    throw new Error('The transaction resolved without running the work to completion.');
  }
  return result as T;
}

async function seedUser(tx: Prisma.TransactionClient, icsToken: string, active = true) {
  return tx.user.create({
    data: {
      email: `${unique('user')}@example.test`,
      name: 'ICS feed fixture',
      oktaId: unique('okta'),
      icsToken,
      active,
    },
  });
}

describe('the ICS feed against a real PostgreSQL', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createPrismaClient({ connectionString: connectionString() });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('resolving the token', () => {
    it('finds the active holder', async () => {
      const found = await inRolledBackTransaction(prisma, async (tx) => {
        const token = unique('ics');
        const user = await seedUser(tx, token);
        const row = await tx.user.findFirst({
          where: { icsToken: token, active: true },
          select: { id: true },
        });
        return { expected: user.id, actual: row?.id ?? null };
      });

      expect(found.actual).toBe(found.expected);
    });

    it('refuses a deactivated holder’s token, with the filter in the WHERE clause', async () => {
      const row = await inRolledBackTransaction(prisma, async (tx) => {
        const token = unique('ics');
        await seedUser(tx, token, false);
        return tx.user.findFirst({ where: { icsToken: token, active: true }, select: { id: true } });
      });

      // `null`, not a row this code then has to remember to check.
      expect(row).toBeNull();
    });

    it('refuses a token nobody holds', async () => {
      const row = await inRolledBackTransaction(prisma, (tx) =>
        tx.user.findFirst({
          where: { icsToken: unique('never-issued'), active: true },
          select: { id: true },
        })
      );

      expect(row).toBeNull();
    });
  });

  describe('reading the reservations', () => {
    it('joins the spot label and honours the date lower bound and ordering', async () => {
      const result = await inRolledBackTransaction(prisma, async (tx) => {
        const token = unique('ics');
        const user = await seedUser(tx, token);
        const spotA = await tx.parkingSpot.create({
          data: { label: unique('A'), group: 'IT' },
        });
        const spotB = await tx.parkingSpot.create({
          data: { label: unique('B'), group: 'SHARED' },
        });
        // Inserted out of order, and one below the bound.
        await tx.reservation.create({
          data: { parkingSpotId: spotB.id, userId: user.id, date: toDateColumn('2099-03-10') },
        });
        await tx.reservation.create({
          data: { parkingSpotId: spotA.id, userId: user.id, date: toDateColumn('2099-02-01') },
        });
        await tx.reservation.create({
          data: { parkingSpotId: spotA.id, userId: user.id, date: toDateColumn('2098-12-31') },
        });

        const rows = await tx.reservation.findMany({
          where: { userId: user.id, date: { gte: toDateColumn('2099-01-01') } },
          include: { parkingSpot: { select: { label: true } } },
          orderBy: [{ date: 'asc' }, { id: 'asc' }],
        });

        return {
          dates: rows.map((row) => toDateOnly(row.date)),
          labels: rows.map((row) => row.parkingSpot.label),
          expectedLabels: [spotA.label, spotB.label],
        };
      });

      expect(result.dates).toEqual(['2099-02-01', '2099-03-10']);
      expect(result.labels).toEqual(result.expectedLabels);
    });

    it('returns nobody else’s reservations', async () => {
      const rows = await inRolledBackTransaction(prisma, async (tx) => {
        const mine = await seedUser(tx, unique('ics'));
        const theirs = await seedUser(tx, unique('ics'));
        const spot = await tx.parkingSpot.create({ data: { label: unique('S'), group: 'IT' } });
        await tx.reservation.create({
          data: { parkingSpotId: spot.id, userId: theirs.id, date: toDateColumn('2099-04-01') },
        });

        return tx.reservation.findMany({
          where: { userId: mine.id, date: { gte: toDateColumn('2099-01-01') } },
          include: { parkingSpot: { select: { label: true } } },
        });
      });

      expect(rows).toEqual([]);
    });

    /**
     * The claim `doc/api-modules.md` §2 calls out as "not exercised against a
     * real Postgres in this environment". It is now.
     *
     * A `@db.Date` has no time and no zone; the adapter hands Prisma a `Date` at
     * **UTC** midnight and `toDateOnly` reads it back with UTC getters. If
     * either end ever used local getters, one of these three days would come
     * back shifted — and the ICS feed would put somebody's parking spot on the
     * wrong day.
     */
    it.each([
      ['2099-03-29', 'a spring-forward Sunday in Europe/Prague'],
      ['2099-10-25', 'a fall-back Sunday in Europe/Prague'],
      ['2096-02-29', 'a leap day'],
      ['2099-01-01', 'a new year'],
    ])('round-trips %s through a @db.Date column (%s)', async (date) => {
      const stored = await inRolledBackTransaction(prisma, async (tx) => {
        const user = await seedUser(tx, unique('ics'));
        const spot = await tx.parkingSpot.create({ data: { label: unique('S'), group: 'IT' } });
        const created = await tx.reservation.create({
          data: { parkingSpotId: spot.id, userId: user.id, date: toDateColumn(date) },
        });
        const read = await tx.reservation.findUniqueOrThrow({ where: { id: created.id } });
        return read.date;
      });

      expect(toDateOnly(stored)).toBe(date);
      // And the value really is UTC midnight, which is the convention the rest
      // of the mapping is built on.
      expect(stored.toISOString()).toBe(`${date}T00:00:00.000Z`);
    });
  });
});
