'use client';

/**
 * Administration: users, parking spots, the reservation window. Task 26 builds
 * the screens; this task routes the avatar menu's `Správa` entry here and
 * closes the door behind it.
 *
 * The gate is a **courtesy**, not the enforcement. Authorization lives on the
 * API, where every admin procedure carries `@Roles('ADMIN')` and `RolesGuard`
 * answers 403 regardless of what any browser believes (`doc/auth.md`). What
 * this does is stop a non-admin who typed the URL from staring at an empty
 * screen wondering why nothing loads — and it fails closed: the role is
 * unknown while `me.get` is in flight and unknown if it fails, and unknown is
 * not an admin.
 */

import { useTranslations } from '@lets-park/i18n';
import { EmptyState } from '@lets-park/design-system/compounds';
import { ScreenError, ScreenLoading } from '../../../shell/screen-state';
import { SectionPlaceholder } from '../../../shell/section-placeholder';
import { useCurrentUser } from '../../../shell/use-current-user';

export default function AdminPage() {
  const errors = useTranslations('errors');
  const { data: profile, isPending, isError, error, refetch } = useCurrentUser();

  if (isPending) {
    return <ScreenLoading />;
  }

  if (isError) {
    return <ScreenError error={error} onRetry={() => void refetch()} headingLevel={2} />;
  }

  if (profile.role !== 'ADMIN') {
    return <EmptyState title={errors('FORBIDDEN')} headingLevel={2} />;
  }

  return <SectionPlaceholder section="administration" />;
}
