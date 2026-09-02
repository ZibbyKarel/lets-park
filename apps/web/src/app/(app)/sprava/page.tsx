'use client';

/**
 * Administration: users, parking spots, the reservation window. Task 26 builds
 * the screens; this task routes the avatar menu's `Správa` entry here and
 * closes the door behind it.
 *
 * The whole file is the wiring — where the profile comes from and what retry
 * does. Every *rule*, the role gate included, lives in `AdminScreen`, which is
 * why this one is a single expression with no branches. Same split, and same
 * reason, as `app-top-bar.tsx` / `top-bar.tsx`.
 */

import { AdminScreen } from '../../../shell/admin-screen';
import { useCurrentUser } from '../../../shell/use-current-user';

export default function AdminPage() {
  const { data: profile, isPending, isError, error, refetch } = useCurrentUser();

  return (
    <AdminScreen
      role={profile?.role}
      isPending={isPending}
      isError={isError}
      error={error}
      onRetry={() => void refetch()}
    />
  );
}
