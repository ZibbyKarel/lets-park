/**
 * Admin management of the reservation window: read and change the singleton
 * settings, and see where each month currently stands.
 *
 * Ordinary users never call any of these — the window state they need for a
 * given day rides along on the day overview (`./overview`).
 */

import * as z from 'zod';
import { yearMonthSchema } from '../schemas/primitives';
import {
  monthWindowOverviewSchema,
  reservationWindowSettingsSchema,
} from '../schemas/reservation-window';
import { authed, contractErrors, noInputSchema } from './errors';

export const getReservationWindowSettingsContract = authed
  .input(noInputSchema)
  .output(reservationWindowSettingsSchema);

/**
 * Full replacement of the singleton, not a patch.
 *
 * The input is the settings schema itself, so an omitted field falls back to its
 * documented default (`openDaysBefore: 7`, `lockMode: 'AUTO'`) rather than to the
 * value currently stored. That is deliberate — there are exactly two fields, the
 * admin form always renders both, and "PUT replaces the resource" is easier to
 * reason about than a patch whose result depends on invisible state. Send both.
 */
export const updateReservationWindowSettingsInputSchema = reservationWindowSettingsSchema;
export type UpdateReservationWindowSettingsInput = z.infer<
  typeof updateReservationWindowSettingsInputSchema
>;
export type UpdateReservationWindowSettingsInputRaw = z.input<
  typeof updateReservationWindowSettingsInputSchema
>;

export const updateReservationWindowSettingsContract = authed
  .input(updateReservationWindowSettingsInputSchema)
  .output(reservationWindowSettingsSchema)
  .errors(contractErrors('VALIDATION_FAILED', 'CONFLICT'));

/**
 * Inclusive range of months to report on. Ordering is checked structurally —
 * `YYYY-MM` sorts lexicographically, so no date arithmetic is needed and the
 * check stays inside the schema.
 */
export const listMonthWindowsInputSchema = z
  .object({
    from: yearMonthSchema,
    to: yearMonthSchema,
  })
  .refine((value) => value.from <= value.to, {
    error: 'from must not be after to',
    path: ['to'],
  });
export type ListMonthWindowsInput = z.infer<typeof listMonthWindowsInputSchema>;

export const listMonthWindowsOutputSchema = z.object({
  /** One entry per month in the requested range, ascending. */
  months: z.array(monthWindowOverviewSchema),
  /**
   * The settings the states were derived under, echoed so the admin tab can
   * render the table and the form from a single response.
   */
  settings: reservationWindowSettingsSchema,
});
export type ListMonthWindowsOutput = z.infer<typeof listMonthWindowsOutputSchema>;

export const listMonthWindowsContract = authed
  .input(listMonthWindowsInputSchema)
  .output(listMonthWindowsOutputSchema)
  .errors(contractErrors('VALIDATION_FAILED'));
