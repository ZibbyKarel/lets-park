/**
 * What the **database** does — pinned against a real PostgreSQL 17.
 *
 * Every other spec in `apps/api` runs against `PrismaDouble`, an in-memory
 * stand-in. A double is fine for logic, but it must never be the only thing
 * that decides what a database *error* looks like, and this suite exists
 * because it once was: `PrismaDouble` fabricated `P2002` with a `meta.target`
 * key, the real `@prisma/adapter-pg` emits no such key, and every unique
 * violation therefore degraded to the vague `CONFLICT` — including
 * `SPOT_ALREADY_RESERVED`, which `plan.md` names as the concurrency guarantee
 * of the whole reservation flow. The mapping was unit-tested and green
 * throughout. Nothing short of a real connection could have caught it.
 *
 * ## Why this is a separate target
 *
 * `nx run-many -t test` has to stay runnable without Docker, so these tests are
 * **excluded** from the `api:test` target by `testPathIgnorePatterns` and run by
 * `nx run api:test-db` instead. They deliberately do **not** skip themselves
 * when `DATABASE_URL` is absent — a suite that skips into green is exactly the
 * false confidence this file was written to remove. No database, no run.
 *
 * ## Why nothing is left behind
 *
 * Every case runs inside an interactive transaction that is always rolled back:
 * the fixtures are created, the constraint is provoked, the error propagates out
 * of the callback and Prisma rolls the whole thing back. That is also the only
 * way to test the `AuditLog` triggers at all — the table rejects `DELETE`, so a
 * row inserted to test it could never be cleaned up any other way.
 */

import { Prisma } from '@lets-park/database';
import type { PrismaClient } from '@lets-park/database';
import { createPrismaClient } from '@lets-park/database';
import {
  mapPrismaErrorCode,
  mapUniqueConstraintViolation,
} from '../common/filters/contract-exception.filter';

const DATE = new Date('2099-01-05T00:00:00.000Z');

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

/**
 * Runs `work` inside a transaction that is **always** rolled back, and returns
 * the error the database raised.
 *
 * Fails the test if the statement succeeded: "no error" and "the wrong error"
 * have to be distinguishable, and a bare `expect(...).rejects` would let a
 * silent success through as a passing assertion about `undefined`.
 */
async function rejectedBy(
  prisma: PrismaClient,
  work: (tx: Prisma.TransactionClient) => Promise<unknown>
): Promise<unknown> {
  const marker = Symbol('rolled back');
  try {
    await prisma.$transaction(async (tx) => {
      await work(tx);
      throw marker;
    });
  } catch (error) {
    if (error === marker) {
      throw new Error('Expected the database to reject this statement, but it succeeded.');
    }
    return error;
  }
  throw new Error('The transaction resolved without rolling back.');
}

/** A unique suffix per call, so a fixture can never collide with real data. */
let counter = 0;
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}-db-spec-${process.pid}-${counter}`;
}

async function seedUser(tx: Prisma.TransactionClient) {
  return tx.user.create({
    data: {
      email: `${unique('user')}@example.test`,
      name: 'Database contract fixture',
      oktaId: unique('okta'),
      icsToken: unique('ics'),
    },
  });
}

async function seedSpot(tx: Prisma.TransactionClient) {
  return tx.parkingSpot.create({ data: { label: unique('SPOT'), group: 'IT' } });
}

describe('what PostgreSQL actually does', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createPrismaClient({ connectionString: connectionString() });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('the shape of a unique-constraint violation', () => {
    it('is P2002 with no `target` key at all, and names the index under the driver adapter', async () => {
      const error = await rejectedBy(prisma, async (tx) => {
        const spot = await seedSpot(tx);
        const [one, two] = [await seedUser(tx), await seedUser(tx)];
        await tx.reservation.create({
          data: { parkingSpotId: spot.id, userId: one.id, date: DATE },
        });
        return tx.reservation.create({
          data: { parkingSpotId: spot.id, userId: two.id, date: DATE },
        });
      });

      expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      const known = error as Prisma.PrismaClientKnownRequestError;
      expect(known.code).toBe('P2002');

      // The fact the mapper has to be built around: Prisma's documented
      // `meta.target` is simply not there on this driver.
      expect(known.meta).toBeDefined();
      expect(known.meta).not.toHaveProperty('target');

      // What *is* there, and what the fallback reads.
      expect(known.meta).toMatchObject({
        driverAdapterError: {
          cause: {
            kind: 'UniqueConstraintViolation',
            constraint: { index: 'Reservation_parkingSpotId_date_key' },
          },
        },
      });
    });
  });

  describe('every unique constraint maps to the contract error it means', () => {
    it('Reservation(parkingSpotId, date) is SPOT_ALREADY_RESERVED', async () => {
      const error = await rejectedBy(prisma, async (tx) => {
        const spot = await seedSpot(tx);
        const [one, two] = [await seedUser(tx), await seedUser(tx)];
        await tx.reservation.create({
          data: { parkingSpotId: spot.id, userId: one.id, date: DATE },
        });
        return tx.reservation.create({
          data: { parkingSpotId: spot.id, userId: two.id, date: DATE },
        });
      });

      const known = error as Prisma.PrismaClientKnownRequestError;
      expect(mapUniqueConstraintViolation(known.meta)).toBe('SPOT_ALREADY_RESERVED');
      expect(mapPrismaErrorCode(known)).toBe('SPOT_ALREADY_RESERVED');
    });

    it('Reservation(userId, date) is RESERVATION_LIMIT_REACHED', async () => {
      const error = await rejectedBy(prisma, async (tx) => {
        const [first, second] = [await seedSpot(tx), await seedSpot(tx)];
        const user = await seedUser(tx);
        await tx.reservation.create({
          data: { parkingSpotId: first.id, userId: user.id, date: DATE },
        });
        return tx.reservation.create({
          data: { parkingSpotId: second.id, userId: user.id, date: DATE },
        });
      });

      const known = error as Prisma.PrismaClientKnownRequestError;
      expect(mapUniqueConstraintViolation(known.meta)).toBe('RESERVATION_LIMIT_REACHED');
    });

    it('WaitlistEntry(parkingSpotId, userId, date) is ALREADY_IN_WAITLIST', async () => {
      const error = await rejectedBy(prisma, async (tx) => {
        const spot = await seedSpot(tx);
        const user = await seedUser(tx);
        await tx.waitlistEntry.create({
          data: { parkingSpotId: spot.id, userId: user.id, date: DATE },
        });
        return tx.waitlistEntry.create({
          data: { parkingSpotId: spot.id, userId: user.id, date: DATE },
        });
      });

      const known = error as Prisma.PrismaClientKnownRequestError;
      expect(mapUniqueConstraintViolation(known.meta)).toBe('ALREADY_IN_WAITLIST');
    });

    it('ParkingSpot(label) degrades to the vague CONFLICT, which is correct', async () => {
      const error = await rejectedBy(prisma, async (tx) => {
        const spot = await seedSpot(tx);
        return tx.parkingSpot.create({ data: { label: spot.label, group: 'SHARED' } });
      });

      const known = error as Prisma.PrismaClientKnownRequestError;
      // Not a reservation conflict, and the contract has no code for "that
      // label is taken" — `CONFLICT` is the honest answer, not a gap.
      expect(mapUniqueConstraintViolation(known.meta)).toBe('CONFLICT');
    });

    it('User(email) degrades to CONFLICT', async () => {
      const error = await rejectedBy(prisma, async (tx) => {
        const user = await seedUser(tx);
        return tx.user.create({
          data: {
            email: user.email,
            name: 'Duplicate',
            oktaId: unique('okta'),
            icsToken: unique('ics'),
          },
        });
      });

      const known = error as Prisma.PrismaClientKnownRequestError;
      expect(mapUniqueConstraintViolation(known.meta)).toBe('CONFLICT');
    });
  });

  describe('the AuditLog append-only triggers', () => {
    async function withAuditRow(
      change: (tx: Prisma.TransactionClient, id: string) => Promise<unknown>
    ): Promise<unknown> {
      return rejectedBy(prisma, async (tx) => {
        const actor = await seedUser(tx);
        const row = await tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'SPOT_UPDATED',
            entityType: 'ParkingSpot',
            entityId: 'fixture',
            payload: { change: 'created' },
          },
        });
        return change(tx, row.id);
      });
    }

    it('rejects an UPDATE', async () => {
      const error = await withAuditRow((tx, id) =>
        tx.auditLog.update({ where: { id }, data: { entityId: 'tampered' } })
      );
      expect(String(error)).toMatch(/append-only|AuditLog/i);
    });

    it('rejects a DELETE', async () => {
      const error = await withAuditRow((tx, id) => tx.auditLog.delete({ where: { id } }));
      expect(String(error)).toMatch(/append-only|AuditLog/i);
    });
  });

  describe('the reservation-window settings singleton', () => {
    it('rejects any row whose id is not 1', async () => {
      const error = await rejectedBy(prisma, (tx) =>
        tx.reservationWindowSettings.create({
          data: { id: 2, openDaysBefore: 7, lockMode: 'AUTO' },
        })
      );
      expect(String(error)).toMatch(/check|constraint/i);
    });
  });
});
