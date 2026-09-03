'use client';

import { IntlProvider } from '@lets-park/i18n';
import { ScreenError } from '../shell/screen-state';
import './global.css';

/**
 * The only thing that catches an error thrown by `RootLayout` itself.
 *
 * `./error.tsx` covers pages and nested layouts, but a throw from the root
 * layout happens *above* it — there is no boundary left inside the tree, so
 * Next.js falls through to `global-error`. That is not a theoretical path
 * here: `layout.tsx:32` does `await auth()`, and Auth.js throws on a session
 * cookie encrypted with an `AUTH_SECRET` that has since been rotated. Every
 * visitor with a stale cookie hits it at once, which is exactly when the app
 * should not be speaking English — and without this file Next.js's own
 * built-in error page (English, unstyled by us) is what they would get.
 *
 * **It replaces the root layout**, so it has to render `<html>` and `<body>`
 * itself and pull in the stylesheet: none of the document the root layout
 * would have produced exists at this point.
 *
 * The copy still comes from the catalogue rather than being hard-coded.
 * `IntlProvider` carries its own locale, time zone and messages
 * (`libs/i18n/src/lib/provider.tsx`) and needs nothing from a server, so the
 * one provider that *can* be re-established here is re-established, and the
 * Czech-UI rule holds at the moment nothing else is working. The others
 * (session, query, socket) are deliberately absent — this screen asks nothing
 * of the API.
 *
 * **Nothing about the error is rendered**, for the same reason as `./error.tsx`:
 * `ScreenError` keys its copy off the contract's error code and falls back to
 * one generic Czech sentence, so no `message`, no stack and no `digest`
 * reaches the page. The full error stays in the server log.
 *
 * `reset()` re-renders the root segment, which is what `ScreenError`'s retry
 * runs — the right affordance when the cause was transient, and harmless when
 * it was not.
 */
export default function GlobalError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  return (
    <html lang="cs">
      <body>
        <IntlProvider>
          <main className="mx-auto w-full max-w-[var(--container)] px-4 py-16">
            <ScreenError error={error} onRetry={reset} />
          </main>
        </IntlProvider>
      </body>
    </html>
  );
}
