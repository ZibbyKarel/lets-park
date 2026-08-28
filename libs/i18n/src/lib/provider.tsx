/**
 * The single place client components attach to next-intl.
 *
 * The app has exactly one locale (Czech, MVP scope — see `plan.md`), so
 * `locale`, `timeZone` and `messages` are fixed defaults rather than
 * something every call site has to thread through. `now` stays overridable
 * in case a future test needs a deterministic clock; production callers omit it.
 */

import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { PRAGUE_TIME_ZONE } from '@lets-park/shared-types';
import { csMessages } from './messages';

export interface IntlProviderProps {
  readonly children: ReactNode;
  /** Overridable for tests only; production callers omit it. */
  readonly now?: Date;
}

/** Wraps `children` with the app's fixed Czech/Europe-Prague next-intl configuration. */
export function IntlProvider({ children, now }: IntlProviderProps) {
  return (
    <NextIntlClientProvider
      locale="cs"
      timeZone={PRAGUE_TIME_ZONE}
      messages={csMessages}
      // `exactOptionalPropertyTypes` forbids passing an explicit `now={undefined}` —
      // `next-intl`'s `now` prop is typed `Date`, not `Date | undefined`.
      {...(now === undefined ? {} : { now })}
    >
      {children}
    </NextIntlClientProvider>
  );
}
