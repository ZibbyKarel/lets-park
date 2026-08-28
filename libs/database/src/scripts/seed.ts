/**
 * Development seed. Run with `npx prisma db seed` from the repo root.
 *
 * Idempotent: every write is an `upsert` on the row's natural key, so running
 * it twice changes nothing and running it against a partially seeded database
 * fills in what is missing. It never deletes anything.
 *
 * `DATABASE_URL` comes from the environment. `prisma db seed` loads the root
 * `.env` through `prisma.config.ts` and this script inherits it; when running
 * the script directly, export the variable yourself.
 */

import { createPrismaClient } from '../lib/create-prisma-client';
import {
  RESERVATION_WINDOW_SETTINGS_ID,
  SEED_PARKING_SPOTS,
  SEED_RESERVATION_WINDOW_SETTINGS,
  SEED_USERS,
} from '../lib/seed-data';

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — copy .env.example to .env (see doc/prostredi.md).');
  }

  const prisma = createPrismaClient({ connectionString });

  try {
    for (const spot of SEED_PARKING_SPOTS) {
      await prisma.parkingSpot.upsert({
        where: { label: spot.label },
        update: { group: spot.group, active: spot.active },
        create: spot,
      });
    }
    console.log(`Seeded ${SEED_PARKING_SPOTS.length} parking spots.`);

    for (const user of SEED_USERS) {
      const { preferredParkingSpotLabel, ...fields } = user;
      const preferredParkingSpotId =
        preferredParkingSpotLabel === null
          ? null
          : (
              await prisma.parkingSpot.findUniqueOrThrow({
                where: { label: preferredParkingSpotLabel },
                select: { id: true },
              })
            ).id;

      await prisma.user.upsert({
        where: { email: user.email },
        update: { ...fields, preferredParkingSpotId },
        create: { ...fields, preferredParkingSpotId },
      });
    }
    console.log(`Seeded ${SEED_USERS.length} users.`);

    // The init migration already inserted this row; the upsert restores the
    // documented defaults if someone changed them while poking around.
    await prisma.reservationWindowSettings.upsert({
      where: { id: RESERVATION_WINDOW_SETTINGS_ID },
      update: SEED_RESERVATION_WINDOW_SETTINGS,
      create: { id: RESERVATION_WINDOW_SETTINGS_ID, ...SEED_RESERVATION_WINDOW_SETTINGS },
    });
    console.log('Seeded reservation window settings.');

    // No reservations or waitlist entries are seeded: they are date-bound and
    // would be in the past by the time anyone runs this. Create them in the UI.
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
