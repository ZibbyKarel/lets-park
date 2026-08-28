/**
 * The single Czech message catalog for the whole UI (see `doc/i18n.md`).
 *
 * Shaped the way next-intl expects a `Messages` object: a plain, JSON-like
 * object of strings grouped into namespaces. It is consumed two ways —
 * through `NextIntlClientProvider`/`getRequestConfig` inside React (see
 * `./provider.tsx` and `./request-config.ts`), and through `createTranslator`
 * outside React (see `translateErrorCode` in `./errors.ts`) — but there is
 * only ever this one object behind both, so the two paths can never disagree.
 *
 * Only the `errors` namespace exists today because translating the contract's
 * closed error-code enum is this task's whole remit (Task 17, `doc/decision/
 * 0003-*`). Add further namespaces here — never a second catalog — when
 * feature code needs more translated UI copy.
 */

import type { ErrorCode } from '@lets-park/contract';

/**
 * One Czech sentence per contract error code, written for a user rather than
 * a developer (the contract's own `message` field stays English and
 * developer-facing — see `libs/contract/src/api/errors.ts`).
 *
 * `OUT_OF_HORIZON` and `RESERVATIONS_LOCKED` are worded to read as different
 * situations on purpose: the first says the window has not opened *yet*, the
 * second says it has already closed. Collapsing them to the same sentence
 * would defeat the reason the contract has two codes at all.
 */
export interface CzechErrorMessages extends Record<ErrorCode, string> {
  readonly SPOT_ALREADY_RESERVED: string;
  readonly RESERVATION_LIMIT_REACHED: string;
  readonly PAST_DATE: string;
  readonly OUT_OF_HORIZON: string;
  readonly NOT_FOUND: string;
  readonly FORBIDDEN: string;
  readonly ALREADY_IN_WAITLIST: string;
  readonly CANNOT_WAITLIST_OWN_SPOT: string;
  readonly SPOT_NOT_OCCUPIED: string;
  readonly VALIDATION_FAILED: string;
  readonly CONFLICT: string;
  readonly RESERVATIONS_LOCKED: string;
}

export interface CzechMessages {
  readonly errors: CzechErrorMessages;
}

export const csMessages: CzechMessages = {
  errors: {
    SPOT_ALREADY_RESERVED: 'Toto parkovací místo je na daný den už rezervované.',
    RESERVATION_LIMIT_REACHED: 'Na tento den už máte rezervaci — na den je povolená jen jedna.',
    PAST_DATE: 'Na tento den už nelze rezervovat, protože je v minulosti.',
    OUT_OF_HORIZON: 'Rezervace na tento měsíc se ještě neotevřely.',
    RESERVATIONS_LOCKED: 'Rezervační okno pro tento měsíc je už uzamčené.',
    NOT_FOUND: 'Požadovaný záznam nebyl nalezen.',
    FORBIDDEN: 'K této akci nemáte oprávnění.',
    ALREADY_IN_WAITLIST: 'Na toto místo a den už čekáte ve frontě.',
    CANNOT_WAITLIST_OWN_SPOT: 'Na vlastní rezervované místo se nelze zařadit do fronty.',
    SPOT_NOT_OCCUPIED: 'Toto místo je volné — místo čekání ve frontě si ho rovnou rezervujte.',
    VALIDATION_FAILED: 'Požadavek porušuje pravidlo rezervací (např. víkend nebo svátek).',
    CONFLICT: 'Někdo jiný mezitím provedl stejnou změnu — zkuste to prosím znovu.',
  },
};
