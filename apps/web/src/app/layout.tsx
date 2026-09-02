import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { auth } from '../auth';
import { apiOriginOf } from '../api-url';
import { Providers } from './providers';
import './global.css';

/**
 * The document, and nothing else.
 *
 * Everything with an opinion about layout lives one level down: `(app)/layout`
 * draws the top bar for signed-in screens, and `prihlaseni/page` draws its own
 * full-height canvas. This file only establishes the language, the stylesheet
 * (which is what wires in the design tokens and the fonts — see
 * `./global.css`) and the client provider boundary.
 */

export const metadata: Metadata = {
  // Czech, like every other user-visible string (`doc/decision/0029-*`). Not
  // routed through `libs/i18n`: metadata is read on the server before any
  // provider exists, and the app has exactly one locale.
  title: 'Let’s Park',
  description: 'Rezervace firemních parkovacích míst.',
};

export default async function RootLayout({ children }: { readonly children: ReactNode }) {
  // Read once, on the server, and handed to `AuthProvider` so the first client
  // render matches the server one instead of flashing "loading" and bouncing a
  // signed-in visitor to Okta. `null` and *absent* mean different things to
  // Auth.js; `auth()` returns `null` for "no session, I checked", which is
  // exactly the distinction `AuthProviderProps.session` documents.
  const session = await auth();

  // Read here rather than in the client component: this is the value
  // `webEnvSchema` validated at boot, so the browser gets the same string the
  // server did without a second, unvalidated `process.env` read.
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';

  return (
    <html lang="cs">
      <body>
        <Providers session={session} apiUrl={apiUrl} socketUrl={originOrEmpty(apiUrl)}>
          {children}
        </Providers>
      </body>
    </html>
  );
}

/**
 * `apiOriginOf` throws on a URL that is not absolute, and a layout that throws
 * renders the error boundary for every route including the login page. The
 * schema makes that impossible in a booted process (`z.url()`), so the only way
 * here is a build-time render with no environment — where an empty string is
 * the honest answer and the socket simply stays closed.
 */
function originOrEmpty(apiUrl: string): string {
  try {
    return apiOriginOf(apiUrl);
  } catch {
    return '';
  }
}
