/**
 * Admin user management: list, and change role or activity.
 *
 * Users are never created through the API — they are provisioned from the Okta
 * token on first sign-in — and never deleted, because reservations and audit
 * entries reference them. Offboarding is `active: false`.
 */

import * as z from 'zod';
import { userSchema } from '../schemas/entities';
import { userRoleSchema } from '../schemas/enums';
import { idSchema } from '../schemas/primitives';
import { authed, contractErrors } from './errors';

/**
 * How a user appears to an admin: everything except `icsToken`.
 *
 * The token is the only secret on the entity — it is what makes a personal ICS
 * feed URL unguessable — and an admin has no reason to hold another person's.
 * Omitting from `userSchema` rather than picking fields means a field added to
 * the entity shows up here by default, which is the safe direction for an
 * admin view.
 */
export const adminUserSchema = userSchema.omit({ icsToken: true });
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminListUsersInputSchema = z.object({
  role: userRoleSchema.optional(),
  active: z.boolean().optional(),
  /** Free-text match against name and email; the backend decides how. */
  search: z.string().min(1).max(200).optional(),
});
export type AdminListUsersInput = z.infer<typeof adminListUsersInputSchema>;

export const adminListUsersOutputSchema = z.object({
  users: z.array(adminUserSchema),
});
export type AdminListUsersOutput = z.infer<typeof adminListUsersOutputSchema>;

export const adminListUsersContract = authed
  .input(adminListUsersInputSchema)
  .output(adminListUsersOutputSchema);

/**
 * Partial update: an omitted field is left alone. Only these two fields are an
 * admin's to change — a name, an email and a licence plate belong to the user.
 */
export const adminUpdateUserInputSchema = userSchema
  .pick({ role: true, active: true })
  .partial()
  .extend({ id: idSchema });
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserInputSchema>;

/**
 * `CONFLICT` guards the two ways an admin can lock the system: demoting or
 * deactivating the last remaining active admin, and deactivating themselves.
 */
export const adminUpdateUserContract = authed
  .input(adminUpdateUserInputSchema)
  .output(adminUserSchema)
  .errors(contractErrors('NOT_FOUND', 'CONFLICT', 'VALIDATION_FAILED'));
