'use client';

/**
 * The parking overview — the application's main screen.
 *
 * This is the **connected** half: it owns the day on screen, reads
 * `overview.day` through `libs/query`, wires the day room's broadcasts onto
 * that cache entry, holds the cell lock while the dialog is open, and hands
 * plain data to the presentational pieces beside it. Everything it decides is
 * a pure function in `./lot-view`; everything it draws is
 * `./lot-grid`, `./lot-header` and `./spot-dialog`.
 *
 * Nothing here names `@tanstack/react-query`, `socket.io-client`, `next-intl`,
 * `next-auth` or `@orpc/client` — the wrapper rule, enforced by
 * `no-restricted-imports` (`doc/wrappers.md`).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  formatMonthName,
  parseDateOnly,
  todayInPrague,
  useTranslations,
  type DateOnly,
} from '@lets-park/i18n';
import { useSession } from '@lets-park/auth/client';
import { useMutation, useQuery, useQueryClient } from '@lets-park/query';
import { useCellLock, useRealtime } from '@lets-park/realtime-client';
import { EmptyState } from '@lets-park/design-system/compounds';
import { useApi } from '../shell/api-provider';
import { useCurrentUser } from '../shell/use-current-user';
import { ScreenError, ScreenLoading } from '../shell/screen-state';
import { DayBar, LotHeader, RealtimeNotice, WindowBanner } from './lot-header';
import { LotGrid } from './lot-grid';
import { SpotDialog } from './spot-dialog';
import { useCellLocks } from './use-cell-locks';
import { useLotRealtime } from './use-lot-realtime';
import { toBannerView, toDayNoteView, toGroupViews, toLotCounts } from './lot-view';

/** How far the year picker reaches either side of the day on screen. */
const YEAR_PICKER_RADIUS = 1;

const MONTHS_IN_YEAR = 12;

/**
 * Moves the day to another month or year.
 *
 * Always through `addMonths`, never by rebuilding the parts: that function
 * already owns the "31 January, one month on, is 28 February" clamp
 * (`@lets-park/shared-types`), and a second implementation of that rule here
 * would be a second thing to get wrong on four days of the year.
 */
function withMonth(date: DateOnly, month: number): DateOnly {
  return addMonths(date, month - parseDateOnly(date).month);
}

function withYear(date: DateOnly, year: number): DateOnly {
  return addMonths(date, (year - parseDateOnly(date).year) * MONTHS_IN_YEAR);
}

export function LotScreen() {
  const t = useTranslations('lot');
  const sections = useTranslations('sections');
  const api = useApi();
  const queryClient = useQueryClient();
  const { status: realtimeStatus, reconnect } = useRealtime();

  const [date, setDate] = useState<DateOnly>(() => todayInPrague());
  const [openSpotId, setOpenSpotId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  // The seam for Task 31. A boolean rather than a fake error: pushing a
  // hand-made `Error` through `ScreenError` would render the generic "try
  // again later" sentence, which is not what "not built yet" means.
  const [bulkNoticeOpen, setBulkNoticeOpen] = useState(false);

  // Otherwise this is a one-way door: once shown, it would sit above the
  // window banner — the screen's most-read element — for the rest of the
  // session, with no dismiss control of its own. Moving to another day is a
  // deliberate enough action to treat as "not asking about that any more".
  useEffect(() => {
    setBulkNoticeOpen(false);
  }, [date]);

  const profile = useCurrentUser();
  const viewerUserId = profile.data?.id ?? null;
  // Unknown means not an admin, which is the only safe direction for this to
  // fail in. Nothing is authorised here — the API's `RolesGuard` is.
  const isAdmin = profile.data?.role === 'ADMIN';

  const { status: sessionStatus } = useSession();
  const dayQuery = useQuery({
    ...api.overview.day.queryOptions({ input: { date } }),
    // Firing before the session exists spends a request the API answers 401,
    // and a 401 is not retried (`shouldRetryQuery`) — the screen would settle
    // into an error state a signed-in user never leaves. Same reasoning, and
    // the same gate, as `useCurrentUser`.
    enabled: sessionStatus === 'authenticated',
  });
  const day = dayQuery.data ?? null;

  useLotRealtime({ date, viewerUserId });
  const locks = useCellLocks(date);

  const context = useMemo(
    () => ({
      canReserve: day?.canReserve ?? false,
      isAdmin,
      viewerUserId,
      locks,
    }),
    [day?.canReserve, isAdmin, viewerUserId, locks]
  );

  const groups = useMemo(
    () => (day === null ? [] : toGroupViews(day.spots, context)),
    [day, context]
  );
  const openSpot = useMemo(
    () => groups.flatMap((group) => group.spots).find((spot) => spot.spotId === openSpotId) ?? null,
    [groups, openSpotId]
  );

  // This client's own hold, taken while the dialog is open and released by the
  // same effect when it closes (`doc/realtime.md`, §"The cell lock"). It is a
  // courtesy, not an authorisation step: skipping it would get a `CONFLICT`
  // from `reservation.create` rather than a double booking — which is also
  // why `info` is excluded: it is the **only** action `SpotDialog` can never
  // write from (`showCancel`/`showPrimary` are both false for it, since the
  // spot is free and unbookable). `reserve` and `mine` write directly, and
  // `queue` can too — joining or leaving the waitlist, or an admin's cancel —
  // so all three still take the hold; only the pure explanation does not.
  useCellLock({
    date,
    parkingSpotId: openSpotId ?? '',
    enabled: openSpot !== null && openSpot.action !== 'info',
  });

  const invalidateDay = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: api.overview.day.queryOptions({ input: { date } }).queryKey,
    });
  }, [api, queryClient, date]);

  /**
   * Every **successful** write ends the same way: close the dialog and
   * refetch the day. Named for `onSuccess`, not TanStack's `onSettled` (which
   * also fires on error) — wired only there, below; a failure goes to
   * `setActionError` and deliberately leaves the dialog open so the caller
   * can see why.
   *
   * The refetch is not belt-and-braces on top of the broadcast — a client
   * cannot patch its own viewer-relative fields from an event it may not even
   * receive (the gateway need not echo to the sender), and `canReserve` and
   * `viewerReservationId` both move on a successful write.
   */
  const onMutationSuccess = useCallback(() => {
    setOpenSpotId(null);
    setActionError(null);
    invalidateDay();
  }, [invalidateDay]);

  const createReservation = useMutation({
    ...api.reservation.create.mutationOptions(),
    onSuccess: onMutationSuccess,
    onError: setActionError,
  });
  const cancelReservation = useMutation({
    ...api.reservation.cancel.mutationOptions(),
    onSuccess: onMutationSuccess,
    onError: setActionError,
  });
  const joinWaitlist = useMutation({
    ...api.waitlist.join.mutationOptions(),
    onSuccess: onMutationSuccess,
    onError: setActionError,
  });
  const leaveWaitlist = useMutation({
    ...api.waitlist.leave.mutationOptions(),
    onSuccess: onMutationSuccess,
    onError: setActionError,
  });

  const counts = useMemo(() => toLotCounts(day?.spots ?? []), [day?.spots]);

  const parts = parseDateOnly(date);
  const years = Array.from(
    { length: YEAR_PICKER_RADIUS * 2 + 1 },
    (_unused, index) => parts.year - YEAR_PICKER_RADIUS + index
  );

  const closeDialog = useCallback(() => {
    setOpenSpotId(null);
    setActionError(null);
  }, []);

  const openDialog = useCallback((spotId: string) => {
    setActionError(null);
    setOpenSpotId(spotId);
  }, []);

  if (dayQuery.isPending) {
    return <ScreenLoading />;
  }
  if (dayQuery.isError || day === null) {
    return (
      <ScreenError
        error={dayQuery.error}
        onRetry={() => {
          void dayQuery.refetch();
        }}
      />
    );
  }

  const banner = toBannerView(day.window, isAdmin);
  const pending =
    createReservation.isPending ||
    cancelReservation.isPending ||
    joinWaitlist.isPending ||
    leaveWaitlist.isPending;

  return (
    <>
      <LotHeader
        date={date}
        counts={counts}
        sectionTitle={sections('lot')}
        // The design's `batchAllowed = windowOpen || admin`, expressed through
        // the field the contract tells us to read instead of re-deriving it.
        // Absent rather than disabled: a normal user in a locked month has no
        // bulk action to take.
        showBulk={day.canReserve}
        onBulk={() => {
          // Task 31 builds the modal. The seam is here so the button is real
          // rather than dead, and so the window gating above is already
          // written and tested when it lands.
          setBulkNoticeOpen(true);
        }}
      />

      {bulkNoticeOpen ? (
        <p
          role="status"
          className="mb-5 rounded-md border border-border bg-bg px-4 py-3 text-base text-fg-3"
        >
          {t('bulkComingSoon')}
        </p>
      ) : null}

      <WindowBanner banner={banner} />
      {realtimeStatus === 'rejected' ? <RealtimeNotice onReconnect={reconnect} /> : null}

      {day.spots.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <LotGrid groups={groups} onOpenSpot={openDialog} onAdminOpenSpot={openDialog} />
      )}

      <DayBar
        date={date}
        note={toDayNoteView(date)}
        month={parts.month}
        year={parts.year}
        years={years}
        onPreviousDay={() => {
          setDate((current) => addDays(current, -1));
        }}
        onNextDay={() => {
          setDate((current) => addDays(current, 1));
        }}
        onToday={() => {
          setDate(todayInPrague());
        }}
        onMonth={(month) => {
          setDate((current) => withMonth(current, month));
        }}
        onYear={(year) => {
          setDate((current) => withYear(current, year));
        }}
      />

      <SpotDialog
        spot={openSpot}
        date={date}
        canReserve={day.canReserve}
        isAdmin={isAdmin}
        monthName={formatMonthName(parts.month)}
        error={actionError}
        pending={pending}
        onClose={closeDialog}
        onReserve={() => {
          if (openSpot === null) return;
          createReservation.mutate({ parkingSpotId: openSpot.spotId, date });
        }}
        onJoinWaitlist={() => {
          if (openSpot === null) return;
          joinWaitlist.mutate({ parkingSpotId: openSpot.spotId, date });
        }}
        onLeaveWaitlist={() => {
          const entryId = openSpot?.viewerWaitlistEntryId;
          if (entryId === null || entryId === undefined) return;
          leaveWaitlist.mutate({ waitlistEntryId: entryId });
        }}
        onCancelReservation={() => {
          const reservationId = day.spots.find((row) => row.spot.id === openSpotId)?.reservation
            ?.id;
          if (reservationId === undefined) return;
          cancelReservation.mutate({ reservationId });
        }}
      />
    </>
  );
}
