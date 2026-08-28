/**
 * Development seed data.
 *
 * Kept as plain data, separate from the script that writes it
 * (`src/scripts/seed.ts`), so it can be asserted against the contract's Zod
 * schemas in `seed-data.spec.ts` without touching a database.
 */

import type { ParkingGroup, ReservationLockMode, UserRole } from '../generated/prisma/enums';

export interface SeedParkingSpot {
  /** Label painted on the spot; the natural key the seed upserts on. */
  label: string;
  group: ParkingGroup;
  active: boolean;
}

export interface SeedUser {
  /** Natural key the seed upserts on. */
  email: string;
  name: string;
  licensePlate: string | null;
  role: UserRole;
  /**
   * `sub` claim the mock OIDC server will issue for this person. See the note
   * in `doc/database.md` — `mock-oauth2-server` runs without a `JSON_CONFIG`,
   * so its login form accepts any subject; these are the values a developer is
   * expected to type in order to land on a seeded account.
   */
  oktaId: string;
  active: boolean;
  /** Secret in the personal ICS feed URL. Fixed here so dev URLs are stable. */
  icsToken: string;
  /** Resolved to `preferredParkingSpotId` by the seed script. */
  preferredParkingSpotLabel: string | null;
}

export interface SeedReservationWindowSettings {
  openDaysBefore: number;
  lockMode: ReservationLockMode;
}

/**
 * The real layout of the office car park: four IT spots and five shared ones.
 * Order is the order they are shown in, and the order the seed inserts them.
 */
export const SEED_PARKING_SPOTS: readonly SeedParkingSpot[] = [
  { label: 'E2.92', group: 'IT', active: true },
  { label: 'E2.93', group: 'IT', active: true },
  { label: 'E2.94', group: 'IT', active: true },
  { label: 'E2.95', group: 'IT', active: true },
  { label: 'E2.96', group: 'SHARED', active: true },
  { label: 'E2.65', group: 'SHARED', active: true },
  { label: 'E2.66', group: 'SHARED', active: true },
  { label: 'E2.61', group: 'SHARED', active: true },
  { label: 'E2.62', group: 'SHARED', active: true },
];

/**
 * Dev accounts. Obviously-fake identities on `example.com`, mirroring the
 * convention in `.env.example`: nothing in this repository may look like a real
 * person's credentials.
 */
export const SEED_USERS: readonly SeedUser[] = [
  {
    email: 'admin@example.com',
    name: 'Dev Admin',
    licensePlate: '1AB 1234',
    role: 'ADMIN',
    oktaId: 'dev-admin',
    active: true,
    icsToken: '019917a0-0000-7000-8000-000000000001',
    preferredParkingSpotLabel: 'E2.92',
  },
  {
    email: 'user@example.com',
    name: 'Dev User',
    licensePlate: '2CD 5678',
    role: 'USER',
    oktaId: 'dev-user',
    active: true,
    icsToken: '019917a0-0000-7000-8000-000000000002',
    preferredParkingSpotLabel: 'E2.96',
  },
  {
    email: 'user2@example.com',
    name: 'Dev User Two',
    licensePlate: null,
    role: 'USER',
    oktaId: 'dev-user-2',
    active: true,
    icsToken: '019917a0-0000-7000-8000-000000000003',
    preferredParkingSpotLabel: null,
  },
  {
    email: 'inactive@example.com',
    name: 'Dev Inactive',
    licensePlate: null,
    role: 'USER',
    oktaId: 'dev-inactive',
    active: false,
    icsToken: '019917a0-0000-7000-8000-000000000004',
    preferredParkingSpotLabel: null,
  },
];

/**
 * Defaults from `doc/decision/0004-mvp-scope-includes-design-features.md`.
 * The init migration already inserts this row (the table must never be empty);
 * the seed re-asserts it so a hand-edited dev database returns to a known state.
 */
export const SEED_RESERVATION_WINDOW_SETTINGS: SeedReservationWindowSettings = {
  openDaysBefore: 7,
  lockMode: 'AUTO',
};

/** Fixed primary key of the settings singleton — see `doc/database.md`. */
export const RESERVATION_WINDOW_SETTINGS_ID = 1;
