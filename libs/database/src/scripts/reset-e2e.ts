/**
 * Puts the development database into the state the Playwright suite expects.
 *
 * Run from the repo root, with `DATABASE_URL` in the environment:
 *
 * ```
 * npx nx run database:reset-e2e
 * ```
 *
 * `apps/web-e2e`'s `globalSetup` runs it (as a subprocess) before the browsers
 * start. Two things make that a subprocess rather than an import:
 *
 * 1. `libs/database` is tagged `scope:api` and `apps/web-e2e` is `scope:web`,
 *    so the module boundary — rightly — forbids the import. A test app is not a
 *    reason to weaken it.
 * 2. The Prisma client then never loads inside a Playwright worker, where it
 *    would hold a connection pool open for the length of the run.
 *
 * ## What it changes, and what it deliberately does not
 *
 * - **Deletes** every reservation and queue entry in the e2e target month (see
 *   {@link e2eTargetMonth}). Scoped to that month rather than truncating the
 *   tables, so a developer's own data on other days survives a test run.
 * - **Widens the reservation window** to {@link MAX_OPEN_DAYS_BEFORE} days, in
 *   `AUTO` mode. This is a *setting an admin can set in the UI*, not a
 *   test-only switch: with the seeded 7 days no month is bookable except during
 *   the last week of the preceding one, so on most days of the year a normal
 *   user could not create a reservation at all and half the scenarios would
 *   have nothing to exercise. At 31 days the *next* month is always open under
 *   the ordinary `AUTO` rule (its window starts on or before the first of the
 *   current month and ends on its last day), which is what the suite books
 *   into. See `doc/decision/0181-*`.
 * - Touches **no user, spot or role**: `prisma db seed` owns those, is
 *   idempotent, and `globalSetup` runs it first.
 *
 * It refuses to run with `NODE_ENV=production`, because "delete a month of
 * reservations" is not a thing that should ever be one stray environment
 * variable away from a real database.
 *
 * ## `SWC_NODE_PROJECT`
 *
 * Both callers set `SWC_NODE_PROJECT=tsconfig.base.json`. This file imports
 * `@lets-park/shared-types` by its workspace alias rather than re-deriving the
 * month arithmetic, `@swc-node/register` resolves `paths` from the tsconfig it
 * is pointed at, and there is no `tsconfig.json` at the workspace root — so
 * without that variable the process dies with `Cannot find module
 * '@lets-park/shared-types'`. `seed.ts` needs no such thing because it imports
 * only relative paths.
 */

import {
  MAX_OPEN_DAYS_BEFORE,
  addMonths,
  endOfMonth,
  startOfMonth,
  todayInPrague,
  type DateOnly,
} from '@lets-park/shared-types';
import { createPrismaClient } from '../lib/create-prisma-client';
import { RESERVATION_WINDOW_SETTINGS_ID } from '../lib/seed-data';

/**
 * The month the e2e suite books into: the one after today's.
 *
 * The current month is never open under `AUTO` at any `openDaysBefore` — the
 * window closes on the last day before the month starts — so "next month" is
 * the nearest month a normal user can be shown booking. Returned as its first
 * and last day rather than as a `YearMonth`, because that is what the delete
 * range needs.
 */
export function e2eTargetMonth(today: DateOnly = todayInPrague()): {
  readonly from: DateOnly;
  readonly to: DateOnly;
} {
  const anchor = addMonths(startOfMonth(today), 1);
  return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
}

/** `YYYY-MM-DD` as the UTC midnight Prisma stores in a `@db.Date` column. */
function toDateColumn(value: DateOnly): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('reset-e2e refuses to run with NODE_ENV=production.');
  }

  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set — copy .env.example to .env (see doc/environment.md).'
    );
  }

  const { from, to } = e2eTargetMonth();
  const range = { gte: toDateColumn(from), lte: toDateColumn(to) };

  const prisma = createPrismaClient({ connectionString });

  try {
    // Queue entries first: nothing references them, and deleting the
    // reservations first would leave a window in which a concurrently running
    // API could promote somebody into the month being cleared.
    const waitlist = await prisma.waitlistEntry.deleteMany({ where: { date: range } });
    const reservations = await prisma.reservation.deleteMany({ where: { date: range } });

    // **Not restored afterwards, and that is the cost of this script.** The row
    // is global and singular, so every run leaves the shared dev database
    // booking-open 31 days ahead until somebody re-seeds — which means a
    // developer who runs the suite and then goes back to clicking around the
    // app is looking at a wider window than the product ships with. Accepted
    // because it is a value an admin can legitimately set through the UI
    // (`doc/decision/0181-*`), and because a teardown that restored it would
    // still be wrong for anyone whose run was interrupted. `npx prisma db seed`
    // puts it back to 7 days.
    await prisma.reservationWindowSettings.upsert({
      where: { id: RESERVATION_WINDOW_SETTINGS_ID },
      update: { openDaysBefore: MAX_OPEN_DAYS_BEFORE, lockMode: 'AUTO' },
      create: {
        id: RESERVATION_WINDOW_SETTINGS_ID,
        openDaysBefore: MAX_OPEN_DAYS_BEFORE,
        lockMode: 'AUTO',
      },
    });

    console.log(
      `Reset ${from}..${to}: deleted ${reservations.count} reservation(s) and ` +
        `${waitlist.count} queue entrie(s); reservation window is AUTO / ` +
        `${MAX_OPEN_DAYS_BEFORE} days.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
