/**
 * Entity schemas — the single source of truth for every shape that crosses the
 * FE ↔ BE boundary, per `plan.md` §"Doménový model" plus the extensions from
 * `doc/decision/0004-rozsah-mvp-vcetne-funkci-z-designu.md`.
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
