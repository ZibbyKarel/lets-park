/**
 * Czech UI copy for the contract's closed error-code enum
 * (`libs/contract/src/schemas/errors.ts`, `doc/kontrakt.md`).
 *
 * Both entry points below read the very same `csMessages.errors` object (see
 * `./messages.ts`), so a plain lookup outside React and a next-intl
 * `Translator` inside React can never drift apart.
 */

import { createTranslator } from 'next-intl';
import type { ErrorCode } from '@lets-park/contract';
import { csMessages } from './messages';

/**
 * A next-intl `Translator` scoped to the `errors` namespace, built directly
 * from `csMessages` — no `NextIntlClientProvider`/request context required.
 *
 * This is what makes `translateErrorCode` usable in plain TypeScript (e.g. a
 * server action or a non-component helper) while still going through
 * next-intl's ICU message resolution, exactly as `useTranslations('errors')`
 * would inside a component.
 */
const errorTranslator = createTranslator({
  locale: 'cs',
  namespace: 'errors',
  messages: csMessages,
});

/**
 * The Czech sentence for one contract error code.
 *
 * Total by construction: `ErrorCode` is the same closed union the message
 * catalog is typed against (`CzechErrorMessages`), so a code without a
 * translation is a compile error here, not a raw enum leaking into the UI.
 */
export function translateErrorCode(code: ErrorCode): string {
  return errorTranslator(code);
}
