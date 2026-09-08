/**
 * Single-day reservations: create and cancel.
 *
 * Bulk booking lives in `./bulk`; it is a different flow with a different
 * failure model (per-day outcomes rather than one all-or-nothing answer).
 */

import * as z from 'zod';
import { reservationSchema } from '../schemas/entities';
import { dateOnlySchema, idSchema } from '../schemas/primitives';
import { authed, contractErrors } from './builder';

/**
 * Derived from the entity, not written out again: the server owns `id`,
 * `userId` (the caller) and `createdAt`.
 */
export const createReservationInputSchema = reservationSchema.pick({
  parkingSpotId: true,
  date: true,
});
export type CreateReservationInput = z.infer<typeof createReservationInputSchema>;

export const createReservationOutputSchema = reservationSchema;
export type CreateReservationOutput = z.infer<typeof createReservationOutputSchema>;

/**
 * Create a reservation for one spot on one day.
 *
 * Window rules (`doc/decision/0004-*`, ruling window-1): a normal user may only
 * create inside an open month, so both window codes are reachable —
 * `OUT_OF_HORIZON` when the target month is `NOT_YET_OPEN` and
 * `RESERVATIONS_LOCKED` when it is `LOCKED`. An admin is not restricted by the
 * window and will never see either.
 *
 * `SPOT_ALREADY_RESERVED` is the honest answer for a spot someone else holds;
 * `CONFLICT` is the narrower case of losing a race between the availability
 * check and the insert, which the unique constraint on (spot, day) turns into a
 * failure rather than a double booking.
 */
export const createReservationContract = authed
  .input(createReservationInputSchema)
  .output(createReservationOutputSchema)
  .errors(
    contractErrors(
      'NOT_FOUND',
      'SPOT_ALREADY_RESERVED',
      'RESERVATION_LIMIT_REACHED',
      'PAST_DATE',
      'OUT_OF_HORIZON',
      'RESERVATIONS_LOCKED',
      'VALIDATION_FAILED',
      'CONFLICT'
    )
  );

export const cancelReservationInputSchema = z.object({
  reservationId: idSchema,
});
export type CancelReservationInput = z.infer<typeof cancelReservationInputSchema>;

export const cancelReservationOutputSchema = z.object({
  reservationId: idSchema,
  /** Echoed so the client can invalidate exactly the affected day and spot. */
  date: dateOnlySchema,
  parkingSpotId: idSchema,
  /**
   * `true` when the freed spot was handed straight to the first person in its
   * waitlist. Auto-promotion is a system action and is exempt from the
   * reservation-window lock, so this can be `true` even in a locked month.
   */
  promoted: z.boolean(),
});
export type CancelReservationOutput = z.infer<typeof cancelReservationOutputSchema>;

/**
 * Cancel a reservation.
 *
 * **Declares no window errors, and that is the point.** Ruling window-1: a
 * normal user may cancel their own reservation at any time, including in a
 * locked month — a locked window stops people from taking spots, not from
 * giving them back. `FORBIDDEN` (from the base builder) covers cancelling
 * somebody else's reservation; an admin may cancel any.
 */
export const cancelReservationContract = authed
  .input(cancelReservationInputSchema)
  .output(cancelReservationOutputSchema)
  .errors(contractErrors('NOT_FOUND', 'CONFLICT'));
