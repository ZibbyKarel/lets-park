'use client';

/**
 * What a failed admin **write** says, per operation.
 *
 * ## Why not `t('errors.' + code)`
 *
 * Because the same contract code means different things on different
 * procedures, and a sentence that is true for one is a false explanation on the
 * other. `CONFLICT` is the clearest case:
 *
 * | procedure                | what `CONFLICT` actually is                       |
 * | ------------------------ | ------------------------------------------------- |
 * | `admin.user.update`      | the last active administrator would be gone       |
 * | `admin.spot.create`      | the label is already painted on another spot      |
 * | `admin.spot.update`      | a duplicate label **or** a spot still held today  |
 * | `admin.spot.deactivate`  | somebody holds the spot from today onwards        |
 * | `admin.window.update`    | nothing the client can cause; a concurrent write  |
 *
 * The `errors` namespace has one sentence per code, written for a reader with
 * no context — right for a screen that failed to load (`ScreenError`), wrong
 * here. Its `VALIDATION_FAILED` even says "weekend or holiday", which has
 * nothing to do with renaming a parking spot.
 *
 * So the mapping is by **(operation, code)** and it is a table, not a chain of
 * conditionals — a table can be read against the contract's `.errors(...)`
 * declarations to see what is missing.
 *
 * ## `admin.spot.update` is three operations, not one
 *
 * One procedure, three intents, and `CONFLICT` means something different in
 * each: renaming can collide with another label, switching a spot **off** can
 * collide with a live reservation, and switching one **on** can collide with
 * neither. The caller says which it asked for; nothing in the response could.
 *
 * ## The fallback never guesses
 *
 * A code with no entry (or a transport failure, which has no code at all) gets
 * the operation's `errFallback*`: "it did not save, try again". That is true of
 * anything unexpected. Falling through to a specific sentence would be the bug
 * this file exists to avoid.
 */

import { toContractError } from '@lets-park/api-client';
import type { ErrorCode } from '@lets-park/contract';
import { useTranslations } from '@lets-park/i18n';

/**
 * One admin write, as the screen that started it understands it — not as the
 * transport does. See the note above on `admin.spot.update`.
 */
export type AdminWrite =
  | 'userUpdate'
  | 'spotCreate'
  | 'spotRename'
  | 'spotRetire'
  | 'spotRevive'
  | 'windowUpdate';

/** Message key in the `admin` namespace, or `undefined` to use the fallback. */
type MessageKey = string;

/**
 * `FORBIDDEN` is inherited by every authenticated procedure, so it is spread
 * into each row rather than repeated by hand. It also happens to be the one
 * code whose meaning does not change with the operation.
 */
const FORBIDDEN_ROW = { FORBIDDEN: 'errForbidden' } as const;

const MESSAGES: Record<
  AdminWrite,
  { readonly fallback: MessageKey; readonly byCode: Partial<Record<ErrorCode, MessageKey>> }
> = {
  userUpdate: {
    fallback: 'errFallbackUser',
    byCode: {
      ...FORBIDDEN_ROW,
      // The other `CONFLICT` case — deactivating yourself — is unreachable from
      // this screen: the switch on your own row is disabled. If that guard is
      // ever removed, this sentence becomes wrong and the test that pins the
      // disabled switch is what will say so.
      CONFLICT: 'errUserConflict',
      NOT_FOUND: 'errUserNotFound',
      VALIDATION_FAILED: 'errUserValidation',
    },
  },
  spotCreate: {
    fallback: 'errFallbackSpot',
    byCode: {
      ...FORBIDDEN_ROW,
      CONFLICT: 'spotsDuplicateLabel',
      VALIDATION_FAILED: 'errSpotValidation',
    },
  },
  spotRename: {
    fallback: 'errFallbackSpot',
    byCode: {
      ...FORBIDDEN_ROW,
      CONFLICT: 'spotsDuplicateLabel',
      NOT_FOUND: 'errSpotNotFound',
      VALIDATION_FAILED: 'errSpotValidation',
    },
  },
  spotRetire: {
    fallback: 'errFallbackSpot',
    byCode: {
      ...FORBIDDEN_ROW,
      CONFLICT: 'spotsDeleteConflict',
      NOT_FOUND: 'errSpotNotFound',
    },
  },
  spotRevive: {
    fallback: 'errFallbackSpot',
    byCode: {
      ...FORBIDDEN_ROW,
      // Deliberately **no** `CONFLICT`: turning a spot back on collides with
      // nothing (`SpotsService.update` only checks reservations when `active`
      // goes to `false`, and the label is unchanged). Claiming a duplicate
      // label here would be inventing a cause.
      NOT_FOUND: 'errSpotNotFound',
    },
  },
  windowUpdate: {
    fallback: 'errFallbackWindow',
    byCode: {
      ...FORBIDDEN_ROW,
      CONFLICT: 'errWindowConflict',
      VALIDATION_FAILED: 'errWindowValidation',
    },
  },
};

/**
 * Returns a formatter for admin write failures. `null` in, `null` out — so a
 * caller can hand it a mutation's `error` and render nothing when there is
 * nothing wrong.
 */
export function useAdminWriteError(): (write: AdminWrite, failure: unknown) => string | null {
  const t = useTranslations('admin');

  return (write: AdminWrite, failure: unknown): string | null => {
    if (failure == null) {
      return null;
    }
    const { fallback, byCode } = MESSAGES[write];
    const code = toContractError(failure)?.code;
    return t((code === undefined ? undefined : byCode[code]) ?? fallback);
  };
}

/** Exposed for the spec, which reads the table against the contract. */
export const ADMIN_WRITE_MESSAGES = MESSAGES;
