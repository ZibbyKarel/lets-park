/**
 * Shared scalar schemas. Every entity schema is built out of these, so a change
 * to the wire representation of an id, a day or a timestamp happens once.
 */

import * as z from 'zod';

/**
 * Primary key of every entity. UUID v4 is the binding choice for the contract;
 * `libs/database` (Task 9) has to follow it, not the other way around.
 */
export const idSchema = z.uuid();
export type Id = z.infer<typeof idSchema>;

/**
 * A reservation day: `YYYY-MM-DD` in Europe/Prague, stored as `DATE` in
 * Postgres — never a timestamp.
 *
 * This validates the **format only**. It deliberately does not check that the
 * day is in the future, nor that it falls inside the reservation window: the
 * window depends on `ReservationWindowSettings` read from the database, which
 * a static schema cannot see. Both checks belong to the service layer, on top
 * of `isMonthOpen` / `monthLockState` from `@lets-park/shared-types`
 * (see `doc/decision/0004-rozsah-mvp-vcetne-funkci-z-designu.md`).
 *
 * Note that `z.iso.date()` does validate the calendar: `2023-02-29` and
 * `2026-04-31` are rejected.
 */
export const dateOnlySchema = z.iso.date();

/** Calendar month `YYYY-MM`, used by the reservation-window overview. */
export const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
  error: 'Expected a YYYY-MM month',
});

/**
 * A point in time, as an ISO 8601 UTC string (`2026-08-28T09:15:00.000Z`).
 *
 * Timestamps travel as strings rather than as `Date` instances so the contract
 * stays transport-neutral — see
 * `doc/decision/0012-casova-razitka-v-kontraktu-jsou-iso-retezce.md`.
 */
export const timestampSchema = z.iso.datetime();
