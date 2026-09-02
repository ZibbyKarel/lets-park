/**
 * Entity schemas — the single source of truth for every shape that crosses the
 * FE ↔ BE boundary, per `plan.md` §"Doménový model" plus the extensions from
 * `doc/decision/0004-mvp-scope-includes-design-features.md`.
 *
 * These describe entities as the API *returns* them. Request payloads (create,
 * update, filter) are derived from them in Task 4 with `.pick()`, `.omit()` and
 * `.partial()` rather than written out again.
 */

import * as z from 'zod';
import { parkingGroupSchema, userRoleSchema } from './enums';
import { dateOnlySchema, idSchema, timestampSchema } from './primitives';

/**
 * An employee. Offboarding deactivates a user (`active: false`) instead of
 * deleting the row, so foreign keys from reservations and the audit log stay
 * intact.
 */
export const userSchema = z.object({
  id: idSchema,
  email: z.email(),
  name: z.string().min(1),
  /** Czech licence plate ("SPZ"); optional, used to identify a parked car. */
  licensePlate: z.string().min(1).nullable(),
  role: userRoleSchema,
  /** Subject claim of the Okta token; the identity we provision against. */
  oktaId: z.string().min(1),
  active: z.boolean(),
  /** Secret in the personal ICS feed URL; regenerating it invalidates the old URL. */
  icsToken: z.string().min(1),
  /** First choice when bulk booking. Never applied to a single-day reservation. */
  preferredParkingSpotId: idSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type User = z.infer<typeof userSchema>;

/**
 * How one user appears to **another** user.
 *
 * Deliberately a `pick` of three fields: the parking screen shows who parks
 * where and which car it is, and nothing else. `email`, `oktaId` and above all
 * `icsToken` (the secret in a personal feed URL) must never reach another
 * user's browser, and picking from `userSchema` means adding a field to the
 * entity cannot silently widen this one.
 *
 * It lives among the entities rather than in `api/` because **both** entry
 * points need it: the day overview returns it, and the realtime events
 * broadcast it into a day room. `src/realtime` must not import from `src/api`,
 * so a projection shared by the two belongs here (Task 5).
 */
export const userSummarySchema = userSchema.pick({
  id: true,
  name: true,
  licensePlate: true,
});
export type UserSummary = z.infer<typeof userSummarySchema>;

/**
 * A physical parking spot. Retired spots are deactivated rather than deleted,
 * for the same foreign-key reason as users.
 */
export const parkingSpotSchema = z.object({
  id: idSchema,
  /** Label painted on the spot, e.g. `E2.92`. Unique across the lot. */
  label: z.string().min(1),
  group: parkingGroupSchema,
  active: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type ParkingSpot = z.infer<typeof parkingSpotSchema>;

/**
 * One spot booked by one user for one day. Two unique constraints back this up
 * in the database: one reservation per spot and day, and one reservation per
 * user and day.
 */
export const reservationSchema = z.object({
  id: idSchema,
  parkingSpotId: idSchema,
  userId: idSchema,
  date: dateOnlySchema,
  createdAt: timestampSchema,
});
export type Reservation = z.infer<typeof reservationSchema>;

/**
 * A reservation as it is shown to everybody who can see the day: which
 * reservation it is, when it was made, and who holds it.
 *
 * `parkingSpotId`, `userId` and `date` are deliberately absent — every consumer
 * already knows all three from its surrounding context (the spot row of the day
 * overview, the event payload of a realtime broadcast), and `user` carries the
 * only part of the holder that may be shown to others.
 *
 * Shared by `src/api` and `src/realtime`, for the reason given on
 * {@link userSummarySchema}.
 */
export const publicReservationSchema = reservationSchema
  .pick({ id: true, createdAt: true })
  .extend({ user: userSummarySchema });
export type PublicReservation = z.infer<typeof publicReservationSchema>;

/**
 * A user waiting for an already-booked spot on a given day. Queue order is
 * `createdAt`, with `id` as the tiebreaker.
 */
export const waitlistEntrySchema = z.object({
  id: idSchema,
  parkingSpotId: idSchema,
  userId: idSchema,
  date: dateOnlySchema,
  createdAt: timestampSchema,
});
export type WaitlistEntry = z.infer<typeof waitlistEntrySchema>;

/**
 * Audit log actions.
 *
 * Deliberately a closed enum: contract-first means a new action must be added
 * here before any service can write it. The list starts with the actions named
 * in `plan.md` §"Doménový model"; later tasks extend it as they introduce
 * further mutations.
 */
export const AUDIT_LOG_ACTIONS = [
  'RESERVATION_CREATED',
  'RESERVATION_CANCELLED',
  'RESERVATION_CANCELLED_BY_ADMIN',
  'WAITLIST_PROMOTED',
  'USER_UPDATED',
  'SPOT_UPDATED',
  /**
   * An admin changed `openDaysBefore` or `lockMode`. Added by Task 12, which is
   * the task that made the change possible: the reservation-window settings are
   * a singleton whose two fields decide, for every user, whether a month can be
   * booked at all, and `plan.md` requires that change to be audited. The
   * existing members all name a row that was created or deleted, so none of them
   * could describe it (`doc/decision/0045-*`).
   */
  'RESERVATION_WINDOW_UPDATED',
] as const;

export const auditLogActionSchema = z.enum(AUDIT_LOG_ACTIONS);
export type AuditLogAction = z.infer<typeof auditLogActionSchema>;

/**
 * Append-only audit trail. Cancelling a reservation is a hard delete plus an
 * audit entry, so this table is what preserves the history.
 */
export const auditLogSchema = z.object({
  id: idSchema,
  /** Who performed the action. System actions are attributed to their trigger. */
  actorUserId: idSchema,
  action: auditLogActionSchema,
  /** Entity kind the action applied to, e.g. `Reservation`. */
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  /** Free-form JSONB detail; its shape depends on `action`. */
  payload: z.record(z.string(), z.unknown()),
  createdAt: timestampSchema,
});
export type AuditLog = z.infer<typeof auditLogSchema>;
