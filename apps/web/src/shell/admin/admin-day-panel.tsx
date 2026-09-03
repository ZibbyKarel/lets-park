'use client';

/**
 * `AdminDayScreen`, connected to the API and the router. Wiring only — every
 * rule lives in the screen, the same split as `settings-page.tsx`.
 *
 * ## Which day
 *
 * Today in Europe/Prague, from `todayInPrague()`. The date bar that lets an
 * admin walk to another day is Task 25's, and it will supply the date from
 * above; `date` is already a prop of `AdminDayScreen`, so wiring it up is a
 * change to this file alone.
 */

import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@lets-park/auth/client';
import { useQuery } from '@lets-park/query';
import { todayInPrague } from '@lets-park/i18n';
import { LOT_ROUTE } from '../../routes';
import { useApi } from '../api-provider';
import { AdminDayScreen } from './admin-day-screen';

export function AdminDayPanel() {
  const api = useApi();
  const router = useRouter();
  const { status } = useRequireAuth();

  // Computed on every render on purpose: the value is a calendar day, so it
  // changes at most once per session, and pinning it in state would leave a tab
  // left open overnight showing yesterday.
  const date = todayInPrague();

  const dayQuery = useQuery({
    ...api.overview.day.queryOptions({ input: { date } }),
    enabled: status === 'authenticated',
  });

  return (
    <AdminDayScreen
      date={date}
      isPending={dayQuery.isPending}
      isError={dayQuery.isError}
      error={dayQuery.error}
      onRetry={() => void dayQuery.refetch()}
      overview={dayQuery.data}
      onOpenLot={() => router.push(LOT_ROUTE)}
    />
  );
}
