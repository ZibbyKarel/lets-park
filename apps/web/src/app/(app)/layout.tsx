import type { ReactNode } from 'react';
import { AppTopBar } from '../../shell/app-top-bar';

/**
 * Everything a signed-in visitor sees sits under the top bar; the login screen
 * does not. That is the whole reason for this route group — it draws the
 * chrome for `(app)/**` without adding a path segment, so the parking overview
 * stays at `/`.
 *
 * There is no session check here. The proxy (`src/proxy.ts`) has already
 * refused the navigation for anyone without one, and `useRequireAuth` in
 * `libs/auth` catches the session that ends while the tab is open. Repeating
 * the check would be a third place for the rule to drift.
 */
export default function AppLayout({ children }: { readonly children: ReactNode }) {
  return (
    <>
      <AppTopBar />
      <main className="mx-auto w-full max-w-[var(--container)] px-4 py-8">{children}</main>
    </>
  );
}
