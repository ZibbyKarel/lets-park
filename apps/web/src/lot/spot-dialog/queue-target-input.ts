/**
 * The admin's queue-target form's pure half: field shape and validation.
 *
 * Narrower than `holder-input.ts` on purpose: `WaitlistEntry.userId` is
 * non-nullable, so there is no guest branch and nothing to map — the form's
 * `userId` **is** `joinWaitlistInputSchema`'s `holderId`, so unlike
 * `toHolderInput` there is no translation function here.
 */

import * as z from 'zod';

/** The form's one field: the user to queue. */
export interface QueueTargetFormValues {
  readonly userId: string;
}

export const queueTargetFormSchema: z.ZodType<QueueTargetFormValues, QueueTargetFormValues> =
  z.object({
    userId: z.string().min(1),
  });
