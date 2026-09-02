/**
 * Turning database rows into the shapes the contract declares.
 *
 * The two representations differ in exactly the ways `doc/database.md` lists
 * under "Where storage differs from the contract", and this is the single place
 * that crosses that gap:
 *
 * | column | contract |
 * | --- | --- |
 * | `DateTime @db.Timestamptz(3)` | ISO 8601 string (`doc/decision/0015-*`) |
 * | `DateTime @db.Date` | `YYYY-MM-DD` (`doc/decision/0003-*`) |
 *
 * Every function below returns a value typed by `z.infer` from
 * `libs/contract` — never a hand-written interface — so a field added to an
 * entity schema stops compiling here until it is mapped.
 *
 * ## The `@db.Date` convention
 *
 * A `DATE` column has no time and no zone. Postgres hands `@prisma/adapter-pg`
 * the text `YYYY-MM-DD` (its `normalize_date` is the identity function), and
 * Prisma turns that into a `Date` at **UTC** midnight. {@link toDateOnly} reads
 * it back with UTC getters for that reason: using local getters would move the
 * day by one for any process running west of Greenwich, and using
 * `toDateOnlyInPrague` would move it by one for every day of the year in
 * Prague's summer offset. Neither is a time-zone conversion that should happen —
 * the calendar day is already the value.
 *
 * This is the one claim in this file that is not exercised against a real
 * Postgres in this environment (Docker is unavailable); see the task report.
 */

import type {
  AdminUser,
  ParkingSpot,
  PublicReservation,
  Reservation,
  User,
  UserSummary,
  WaitlistEntry,
} from '@lets-park/contract';
import type {
  ParkingSpot as ParkingSpotRow,
  Reservation as ReservationRow,
  User as UserRow,
  WaitlistEntry as WaitlistEntryRow,
  ReservationWindowSettings as ReservationWindowSettingsRow,
} from '@lets-park/database';
import type { DateOnly } from '@lets-park/shared-types';
import { assertDateOnly } from '@lets-park/shared-types';
import type { ReservationWindowSettings } from '@lets-park/contract';

/** A `@db.Timestamptz` column as the contract's ISO 8601 string. */
export function toTimestamp(value: Date): string {
  return value.toISOString();
}

/** A `@db.Date` column as the contract's `YYYY-MM-DD`. See the note above. */
export function toDateOnly(value: Date): DateOnly {
  const year = String(value.getUTCFullYear()).padStart(4, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * A `YYYY-MM-DD` as the value to write into (or compare against) a `@db.Date`
 * column: UTC midnight, the same convention {@link toDateOnly} reads.
 */
export function toDateColumn(value: DateOnly): Date {
  assertDateOnly(value);
  return new Date(`${value}T00:00:00.000Z`);
}

export function toContractSpot(row: ParkingSpotRow): ParkingSpot {
  return {
    id: row.id,
    label: row.label,
    group: row.group,
    active: row.active,
    createdAt: toTimestamp(row.createdAt),
    updatedAt: toTimestamp(row.updatedAt),
  };
}

/** The caller's own record. `icsToken` is included — see `myProfileSchema`. */
export function toContractUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    licensePlate: row.licensePlate,
    role: row.role,
    oktaId: row.oktaId,
    active: row.active,
    icsToken: row.icsToken,
    preferredParkingSpotId: row.preferredParkingSpotId,
    createdAt: toTimestamp(row.createdAt),
    updatedAt: toTimestamp(row.updatedAt),
  };
}

/**
 * How a user appears to an **admin**: everything except `icsToken`.
 *
 * Built by removing the token from the full projection rather than by listing
 * the remaining fields, so that a field added to `userSchema` reaches the admin
 * table by default. `adminUserSchema` is an `omit` for the same reason.
 */
export function toAdminUser(row: UserRow): AdminUser {
  const { icsToken: _icsToken, ...rest } = toContractUser(row);
  return rest;
}

/** How a user appears to **another user**: three fields, never the token. */
export function toUserSummary(row: Pick<UserRow, 'id' | 'name' | 'licensePlate'>): UserSummary {
  return { id: row.id, name: row.name, licensePlate: row.licensePlate };
}

/** A reservation row, whole. What `reservation.create` answers with. */
export function toContractReservation(row: ReservationRow): Reservation {
  return {
    id: row.id,
    parkingSpotId: row.parkingSpotId,
    userId: row.userId,
    date: toDateOnly(row.date),
    createdAt: toTimestamp(row.createdAt),
  };
}

/**
 * A reservation as everybody who can see the day sees it: the reservation, and
 * the holder as a {@link toUserSummary}.
 *
 * The spot, the day and the holder's id are deliberately absent from
 * `publicReservationSchema` — every consumer already knows them from context —
 * so this takes the holder separately rather than joining them back in.
 */
export function toPublicReservation(
  row: ReservationRow,
  holder: Pick<UserRow, 'id' | 'name' | 'licensePlate'>
): PublicReservation {
  return {
    id: row.id,
    createdAt: toTimestamp(row.createdAt),
    user: toUserSummary(holder),
  };
}

/** A waitlist row, whole. What `waitlist.join` answers with. */
export function toContractWaitlistEntry(row: WaitlistEntryRow): WaitlistEntry {
  return {
    id: row.id,
    parkingSpotId: row.parkingSpotId,
    userId: row.userId,
    date: toDateOnly(row.date),
    createdAt: toTimestamp(row.createdAt),
  };
}

/**
 * The singleton settings row. `id` and `updatedAt` are storage-only — the
 * contract's `reservationWindowSettingsSchema` has neither.
 */
export function toContractWindowSettings(
  row: ReservationWindowSettingsRow
): ReservationWindowSettings {
  return { openDaysBefore: row.openDaysBefore, lockMode: row.lockMode };
}
