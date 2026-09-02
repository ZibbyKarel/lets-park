'use client';

/**
 * `TopBar`, connected to the session and the profile.
 *
 * The whole file is the wiring: which two sources the name and email come
 * from, where the role comes from, and what the two menu actions do. Every
 * *rule* lives in `./top-bar.tsx`, which is why this one is three expressions
 * long and has no branches of its own.
 */

import { useRouter } from 'next/navigation';
import { signOut, useSession } from '@lets-park/auth/client';
import { LOGIN_ROUTE } from '../routes';
import { TopBar } from './top-bar';
import { useCurrentUser } from './use-current-user';

export function AppTopBar() {
  const router = useRouter();
  const { data: session } = useSession();
  const { data: profile } = useCurrentUser();

  // The profile is authoritative once it arrives; until then the session's own
  // claims keep the bar from rendering an empty pill. Both can be absent on the
  // very first paint, which is what the fallbacks are for.
  return (
    <TopBar
      name={profile?.name ?? session?.user?.name ?? ''}
      email={profile?.email ?? session?.user?.email ?? ''}
      role={profile?.role}
      onNavigate={(route) => router.push(route)}
      // `redirectTo` rather than letting Auth.js fall back to the current URL:
      // the current URL is a protected screen, so the proxy would bounce the
      // now-signed-out visitor to the login page anyway — one navigation
      // instead of two, and no flash of a screen they can no longer read.
      onSignOut={() => void signOut({ redirectTo: LOGIN_ROUTE })}
    />
  );
}
