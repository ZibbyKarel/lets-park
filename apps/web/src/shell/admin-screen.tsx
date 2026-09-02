'use client';

/**
 * What `/sprava` renders, given a profile — and nothing about how the profile
 * is obtained.
 *
 * Split out of `app/(app)/sprava/page.tsx` for the same reason `TopBar` is
 * split from `AppTopBar`: the *rules* (which of the four states is shown, and
 * on what) belong somewhere a test can reach without a session, a query client
 * and a live API. The page keeps the wiring and has no branches of its own.
 *
 * The role gate here is a **courtesy**, not the enforcement. Authorization
 * lives on the API, where every admin procedure carries `@Roles('ADMIN')` and
 * `RolesGuard` answers 403 regardless of what any browser believes
 * (`doc/auth.md`). What it does is stop a non-admin who typed the URL from
 * staring at an empty screen wondering why nothing loads — and it fails closed:
 * an unknown role (the profile is still in flight, or it failed) is not an
 * admin.
 */

import type { UserRole } from '@lets-park/contract';
import { useTranslations } from '@lets-park/i18n';
import { EmptyState } from '@lets-park/design-system/compounds';
import { ScreenError, ScreenLoading } from './screen-state';
import { SectionPlaceholder } from './section-placeholder';

export interface AdminScreenProps {
  /** The caller's role, or `undefined` while it is not known. */
  readonly role: UserRole | undefined;
  /** The profile has not arrived yet. */
  readonly isPending: boolean;
  /** The profile could not be loaded. */
  readonly isError: boolean;
  /** Whatever the failing call threw. See `ScreenErrorProps.error`. */
  readonly error: unknown;
  readonly onRetry: () => void;
}

export function AdminScreen({ role, isPending, isError, error, onRetry }: AdminScreenProps) {
  const errors = useTranslations('errors');

  if (isPending) {
    return <ScreenLoading />;
  }

  if (isError) {
    return <ScreenError error={error} onRetry={onRetry} headingLevel={2} />;
  }

  if (role !== 'ADMIN') {
    return <EmptyState title={errors('FORBIDDEN')} headingLevel={2} />;
  }

  return <SectionPlaceholder section="administration" />;
}
