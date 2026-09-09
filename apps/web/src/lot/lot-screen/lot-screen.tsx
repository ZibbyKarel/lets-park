'use client';

/**
 * The parking overview — the application's main screen.
 *
 * This is the **connected** half: it owns the day on screen, reads
 * `overview.day` through `libs/query`, wires the day room's broadcasts onto
 * that cache entry, holds the cell lock while the dialog is open, and hands
 * plain data to the presentational pieces beside it. Everything it decides is
 * a pure function in `./lot-view`; everything it draws is
 * `./lot-grid`, `./lot-header`, `./date-picker-dialog` and `./spot-dialog`.
 *
 * Nothing here names `@tanstack/react-query`, `socket.io-client`, `next-intl`,
 * `next-auth` or `@orpc/client` — the wrapper rule, enforced by
 * `no-restricted-imports` (`doc/wrappers.md`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  parseDateOnly,
  todayInPrague,
  useDateFormatters,
  useTranslations,
  type DateOnly,
} from '@lets-park/i18n';
import { useSession } from '@lets-park/auth/client';
import { useMutation, useQuery, useQueryClient } from '@lets-park/query';
import { useCellLock, useRealtime } from '@lets-park/realtime-client';
import { EmptyState } from '@lets-park/design-system/compounds';
import { toContractError } from '@lets-park/api-client';
import { useApi } from '../../shell/api-provider/api-provider';
import { useCurrentUser } from '../../shell/use-current-user';
import { ScreenError, ScreenLoading } from '../../shell/screen-state/screen-state';
import { LotHeader, RealtimeNotice, WindowBanner } from '../lot-header/lot-header';
import { DatePickerDialog } from '../date-picker-dialog/date-picker-dialog';
import { LotGrid } from '../lot-grid/lot-grid';
import { BulkReservationModal } from '../bulk-modal/bulk-modal';
import { SpotDialog } from '../spot-dialog/spot-dialog';
import type { HolderOption } from '../spot-dialog/holder-input';
import { useCellLocks } from './use-cell-locks';
import { useLotRealtime } from './use-lot-realtime';
import {
  toBannerView,
  toDayNoteView,
  toGroupViews,
  toLotCounts,
  toRealtimeNoticeView,
} from '../lot-view';

/** How far the date-picker's year selector reaches either side of the day on screen. */
const YEAR_PICKER_RADIUS = 1;

export function LotScreen() {
  const t = useTranslations('lot');
  const sections = useTranslations('sections');
  const f = useDateFormatters();
  const api = useApi();
  const queryClient = useQueryClient();
  const { status: realtimeStatus, reconnect } = useRealtime();

  // A ref, not state: it only ever goes false → true, and it is read while
  // deciding what to draw in the same render that sets it. Writing it during
  // render is safe for exactly that reason — no subscriber to wake, no second
  // commit, and `useRealtime()` is what re-renders this component when the
  // status moves. See `toRealtimeNoticeView` for why "has it ever connected"
  // is the question at all.
  const hasEverConnected = useRef(false);
  if (realtimeStatus === 'connected') hasEverConnected.current = true;
  const realtimeNotice = toRealtimeNoticeView(realtimeStatus, hasEverConnected.current);

  const [date, setDate] = useState<DateOnly>(() => todayInPrague());
  const [openSpotId, setOpenSpotId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  /**
   * The one substitution for `actionError`'s code-mapped copy — see
   * `SpotDialog`'s `errorMessage` doc comment. `null` for every failure
   * except a named-holder `reservation.create` naming someone other than the
   * viewer, so a self-booking create and every `waitlist`/`cancel` failure
   * keep the plain catalogue string untouched.
   */
  const [holderLimitMessage, setHolderLimitMessage] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // The modal's grid is the month of `date`, and its selection belongs to that
  // month — the contract refuses a batch spanning two. Moving the day is
  // deliberate enough to treat as leaving the flow.
  useEffect(() => {
    setBulkOpen(false);
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

  // Only an admin may name a holder, so only an admin fetches the list. Filtered
  // server-side: `adminListUsersInputSchema` carries `active`, and a deactivated
  // colleague is not somebody to book a bay for.
  const holderQuery = useQuery({
    ...api.admin.user.list.queryOptions({ input: { active: true } }),
    enabled: sessionStatus === 'authenticated' && isAdmin,
  });

  // Both gated on `isAdmin`: `holderQuery` stays `enabled: false` for a normal
  // user, and a disabled TanStack query reports `isPending: true` forever
  // (`status` never leaves `'pending'`) — reading either flag unguarded would
  // disable a normal user's button and show them an error that never resolves.
  const holderPending = isAdmin && holderQuery.isPending;
  const holderError = isAdmin && holderQuery.isError ? holderQuery.error : null;

  const holderOptions = useMemo<readonly HolderOption[]>(
    () =>
      (holderQuery.data?.users ?? []).map((row) => ({
        userId: row.id,
        name: row.name,
        licensePlate: row.licensePlate,
      })),
    [holderQuery.data]
  );

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
    setHolderLimitMessage(null);
    invalidateDay();
  }, [invalidateDay]);

  /**
   * `waitlist.join`/`waitlist.leave`/`reservation.cancel` all report a
   * failure the same plain way — `holderLimitMessage` is `createReservation`'s
   * substitution alone, so every other write clears it rather than risking a
   * stale message surviving from an earlier `reservation.create` failure in
   * the same dialog session (`waitlist.join` sharing this code with
   * `reservation.create` is exactly the regression this guards).
   *
   * Defence-in-depth, and measured to be exactly that: deleting this clear
   * leaves the whole web suite green, because one dialog is either a free bay
   * offering Rezervovat or a taken one offering the queue — never both — so
   * the two failures cannot follow each other without `closeDialog` or
   * `openDialog` (which clear it too) running in between. It stays for the
   * dialog that offers both one day; see `lot-screen.spec.tsx`'s
   * carry-over test, which pins those two clears rather than this one.
   */
  const onWriteError = useCallback((error: unknown) => {
    setHolderLimitMessage(null);
    setActionError(error);
  }, []);

  const createReservation = useMutation({
    ...api.reservation.create.mutationOptions(),
    onSuccess: onMutationSuccess,
    /**
     * The one place that can tell the `RESERVATION_LIMIT_REACHED` this call
     * got back apart from every other caller of the same code: `variables`
     * is what *this* call actually submitted. A named holder other than the
     * viewer — a `GUEST`, or a `USER` whose id isn't the viewer's — reads the
     * catalogue's "you already have a reservation" as false, so it renders
     * `lot.errHolderLimitReached` instead; an admin naming *themselves*, a
     * plain self-booking create, and every other code all fall through to the
     * plain catalogue string via `holderLimitMessage` staying `null`.
     *
     * The `GUEST` branch of `namedOther` cannot actually fire today — a guest
     * holder is written with `userId: null`
     * (`apps/api/src/reservations/reservations.service.ts`), which is exempt
     * from the `Reservation(userId, date)` constraint this code comes from
     * (`doc/decision/0303-*`), so `reservation.create` never returns
     * `RESERVATION_LIMIT_REACHED` for a guest. Left in because it is the
     * correct answer if that ever changes, not because it is reachable now.
     */
    onError: (error, variables) => {
      const holder = variables.holder;
      const namedOther =
        holder !== undefined && (holder.kind === 'GUEST' || holder.userId !== viewerUserId);
      setHolderLimitMessage(
        namedOther && toContractError(error)?.code === 'RESERVATION_LIMIT_REACHED'
          ? t('errHolderLimitReached')
          : null
      );
      setActionError(error);
    },
  });
  const cancelReservation = useMutation({
    ...api.reservation.cancel.mutationOptions(),
    onSuccess: onMutationSuccess,
    onError: onWriteError,
  });
  const joinWaitlist = useMutation({
    ...api.waitlist.join.mutationOptions(),
    onSuccess: onMutationSuccess,
    onError: onWriteError,
  });
  const leaveWaitlist = useMutation({
    ...api.waitlist.leave.mutationOptions(),
    onSuccess: onMutationSuccess,
    onError: onWriteError,
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
    setHolderLimitMessage(null);
  }, []);

  const openDialog = useCallback((spotId: string) => {
    setActionError(null);
    setHolderLimitMessage(null);
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

  const banner = toBannerView(day.window, isAdmin, f);
  const pending =
    createReservation.isPending ||
    cancelReservation.isPending ||
    joinWaitlist.isPending ||
    leaveWaitlist.isPending;

  return (
    <>
      <LotHeader
        date={date}
        note={toDayNoteView(date)}
        counts={counts}
        sectionTitle={sections('lot')}
        // The design's `batchAllowed = windowOpen || admin`, expressed through
        // the field the contract tells us to read instead of re-deriving it.
        // Absent rather than disabled: a normal user in a locked month has no
        // bulk action to take.
        //
        // `canReserveMonth`, **not** `canReserve`: the bulk modal's subject is
        // the month, and `canReserve` is per-day — reading it hid this button
        // on every weekend, holiday and past day of an open month
        // (`doc/decision/0175-*`).
        showBulk={day.canReserveMonth}
        onBulk={() => {
          setBulkOpen(true);
        }}
        onPreviousDay={() => {
          setDate((current) => addDays(current, -1));
        }}
        onNextDay={() => {
          setDate((current) => addDays(current, 1));
        }}
        onToday={() => {
          setDate(todayInPrague());
        }}
        onOpenDatePicker={() => {
          setDatePickerOpen(true);
        }}
      />

      {/*
        `canReserveMonth` is passed as well as consulted by `showBulk` above,
        because hiding a control is not enforcement: the window can close
        while the modal is already open, and the modal is what refuses then
        (`doc/decision/0173-*`).
      */}
      <BulkReservationModal
        open={bulkOpen}
        onClose={() => {
          setBulkOpen(false);
        }}
        anchorDate={date}
        canReserveMonth={day.canReserveMonth}
      />

      <DatePickerDialog
        open={datePickerOpen}
        onClose={() => {
          setDatePickerOpen(false);
        }}
        selectedDate={date}
        years={years}
        onSelect={(selected) => {
          setDate(selected);
          setDatePickerOpen(false);
        }}
      />

      <WindowBanner banner={banner} />
      {/*
        Both non-live states are drawn, not just the terminal one. `dropped`
        gets no button because the connection is already retrying; `rejected`
        gets one because it is not. `none` covers a live board *and* a board
        that has not connected for the first time yet — see
        `toRealtimeNoticeView`.
      */}
      {realtimeNotice === 'none' ? null : (
        <RealtimeNotice onReconnect={realtimeNotice === 'rejected' ? reconnect : undefined} />
      )}

      {day.spots.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <LotGrid groups={groups} onOpenSpot={openDialog} onAdminOpenSpot={openDialog} />
      )}

      <SpotDialog
        spot={openSpot}
        date={date}
        canReserve={day.canReserve}
        isAdmin={isAdmin}
        monthName={f.monthName(parts.month)}
        error={actionError ?? holderError}
        {...(holderLimitMessage === null ? {} : { errorMessage: holderLimitMessage })}
        pending={pending}
        viewerUserId={viewerUserId}
        holderOptions={holderOptions}
        holderPending={holderPending}
        onClose={closeDialog}
        onReserve={(holder) => {
          if (openSpot === null) return;
          createReservation.mutate({
            parkingSpotId: openSpot.spotId,
            date,
            ...(holder === undefined ? {} : { holder }),
          });
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
