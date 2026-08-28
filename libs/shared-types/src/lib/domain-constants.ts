/**
 * Closed enumerations of the domain, as plain readonly tuples.
 *
 * `libs/shared-types` must not depend on Zod (it is imported by `apps/api`,
 * `libs/contract` and `libs/i18n` alike), so the values live here and
 * `libs/contract` builds its Zod enums on top of them — `z.enum(PARKING_GROUPS)`.
 * That keeps one single list of allowed values while the contract types stay
 * derived through `z.infer`.
 */

/** Parking spot group. IT spots are reserved for the IT department. */
export const PARKING_GROUPS = ['IT', 'SHARED'] as const;
export type ParkingGroup = (typeof PARKING_GROUPS)[number];

/** Application role. There are exactly two; there is no per-resource ACL. */
export const USER_ROLES = ['USER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Admin override of the reservation window
 * (see `doc/decision/0004-rozsah-mvp-vcetne-funkci-z-designu.md`).
 *
 * - `AUTO`         — the window is derived from `openDaysBefore`.
 * - `FORCE_OPEN`   — reservations are open regardless of the date.
 * - `FORCE_LOCKED` — reservations are closed regardless of the date.
 */
export const RESERVATION_LOCK_MODES = ['AUTO', 'FORCE_OPEN', 'FORCE_LOCKED'] as const;
export type ReservationLockMode = (typeof RESERVATION_LOCK_MODES)[number];

/**
 * State of a target month with respect to the reservation window.
 *
 * - `NOT_YET_OPEN` — the window has not opened yet ("Zatím neotevřeno").
 * - `OPEN`         — the window is open ("Otevřeno").
 * - `LOCKED`       — the window has closed ("Uzamčeno"); a month is locked from
 *   its own first day onwards, so the *current* month is never open.
 */
export const MONTH_LOCK_STATES = ['NOT_YET_OPEN', 'OPEN', 'LOCKED'] as const;
export type MonthLockState = (typeof MONTH_LOCK_STATES)[number];

/** Default number of days before the first of the month that the window opens. */
export const DEFAULT_OPEN_DAYS_BEFORE = 7;

/** Inclusive bounds accepted for `openDaysBefore`. */
export const MIN_OPEN_DAYS_BEFORE = 1;
export const MAX_OPEN_DAYS_BEFORE = 31;

/** Default admin override of the reservation window. */
export const DEFAULT_RESERVATION_LOCK_MODE: ReservationLockMode = 'AUTO';

/**
 * What the bulk-booking allocator managed to do with one selected day
 * (`doc/decision/0004-*`, §Hromadná rezervace). The same three outcomes describe
 * the read-only proposal (`previewBulk`) and the real result (`confirmBulk`), so
 * the UI can lay the two side by side and show where reality differed.
 *
 * - `SPOT_ASSIGNED` — a free spot was found (possibly the preferred one).
 * - `QUEUED`        — every spot was taken, the user went into a waitlist.
 * - `UNAVAILABLE`   — nothing could be done for that day; see
 *   {@link BULK_UNAVAILABLE_REASONS}.
 */
export const BULK_DAY_OUTCOMES = ['SPOT_ASSIGNED', 'QUEUED', 'UNAVAILABLE'] as const;
export type BulkDayOutcome = (typeof BULK_DAY_OUTCOMES)[number];

/**
 * Why a selected day produced no reservation and no queue position.
 *
 * These are *per-day* facts reported inside a successful response, not errors:
 * one impossible day must not throw away the rest of the batch. Conditions that
 * invalidate the whole request (locked month, day in the past) are contract
 * errors on the procedure instead.
 *
 * - `ALREADY_HAS_RESERVATION` — the user already holds a reservation that day
 *   (one reservation per user and day).
 * - `NOT_A_BUSINESS_DAY`      — weekend or Czech public holiday.
 * - `NO_SPOTS_AVAILABLE`      — no active spot exists to reserve or queue for.
 */
export const BULK_UNAVAILABLE_REASONS = [
  'ALREADY_HAS_RESERVATION',
  'NOT_A_BUSINESS_DAY',
  'NO_SPOTS_AVAILABLE',
] as const;
export type BulkUnavailableReason = (typeof BULK_UNAVAILABLE_REASONS)[number];

/**
 * Upper bound on the number of days one bulk booking may carry.
 *
 * A bulk selection is made inside a single calendar month, so 31 is the natural
 * ceiling. The contract enforces it structurally; the service layer still has to
 * reject days outside the open window.
 */
export const MAX_BULK_BOOKING_DAYS = 31;
