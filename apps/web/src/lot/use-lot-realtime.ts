'use client';

/**
 * Wires the day room's broadcasts onto the day overview in the query cache.
 *
 * The decisions all live in `./day-overview-cache` as pure functions; this
 * file is only the plumbing that reads the current cache entry, applies one,
 * writes it back and — when the event can have moved a viewer-relative field
 * — asks for a refetch. See that module's header for why both halves exist.
 *
 * Joining the room is here too, so a screen has exactly one call to make:
 * `useDayRoom` and the four listeners are the same subscription seen from two
 * angles, and splitting them across two hooks would make it possible to listen
 * without joining.
 */

import { useCallback, useMemo } from 'react';
import { useDayRoom, useRealtimeEvent } from '@lets-park/realtime-client';
import { useQueryClient } from '@lets-park/query';
import type { DayOverviewOutput } from '@lets-park/contract';
import type { DateOnly } from '@lets-park/i18n';
import { useApi } from '../shell/api-provider';
import {
  applyReservationCancelled,
  applyReservationCreated,
  applyReservationReassigned,
  applyWaitlistUpdated,
  reservationCancelledTouchesViewer,
  reservationCreatedTouchesViewer,
  reservationReassignedTouchesViewer,
  waitlistUpdatedTouchesViewer,
} from './day-overview-cache';

export interface LotRealtimeOptions {
  /** The day on screen. `null` while there is none — no room is joined. */
  readonly date: DateOnly | null;
  /** From `me.get`; `null` while it is in flight. */
  readonly viewerUserId: string | null;
}

export function useLotRealtime({ date, viewerUserId }: LotRealtimeOptions): void {
  const api = useApi();
  const queryClient = useQueryClient();

  useDayRoom(date);

  // Derived from the contract through `createApiQueryUtils`, never spelled out
  // — a hand-written key that differed by one character would patch a cache
  // entry nothing reads, and the screen would look like the events had never
  // arrived. Memoised because `queryOptions()` mints a fresh array per call
  // and the callbacks below depend on it.
  const queryKey = useMemo(
    () => (date === null ? null : api.overview.day.queryOptions({ input: { date } }).queryKey),
    [api, date]
  );

  /**
   * One event, handled the one way: patch what the payload determines, then
   * invalidate if it may have moved something the payload is not allowed to
   * carry.
   *
   * `touches` is evaluated against the state the event arrived at, not the
   * patched one. Today the two agree — no patch writes a viewer field — and
   * evaluating against the pre-patch state keeps that a property of this
   * function rather than a coincidence of the four patches.
   */
  const handle = useCallback(
    <E>(
      event: E,
      apply: (day: DayOverviewOutput, event: E) => DayOverviewOutput,
      touchesViewer: (day: DayOverviewOutput, event: E) => boolean
    ) => {
      if (queryKey === null) return;

      const current = queryClient.getQueryData<DayOverviewOutput>(queryKey);
      // Nothing cached for this day: there is no stale render to correct and
      // nothing to refetch into. Whatever mounts next fetches it fresh.
      if (current === undefined) return;

      const next = apply(current, event);
      if (next !== current) queryClient.setQueryData(queryKey, next);
      if (touchesViewer(current, event)) void queryClient.invalidateQueries({ queryKey });
    },
    [queryClient, queryKey]
  );

  useRealtimeEvent(
    'reservation:created',
    useCallback(
      (event) => {
        handle(event, applyReservationCreated, (_day, created) =>
          reservationCreatedTouchesViewer(created, viewerUserId)
        );
      },
      [handle, viewerUserId]
    )
  );

  useRealtimeEvent(
    'reservation:cancelled',
    useCallback(
      (event) => {
        handle(event, applyReservationCancelled, reservationCancelledTouchesViewer);
      },
      [handle]
    )
  );

  useRealtimeEvent(
    'reservation:reassigned',
    useCallback(
      (event) => {
        handle(event, applyReservationReassigned, (day, reassigned) =>
          reservationReassignedTouchesViewer(day, reassigned, viewerUserId)
        );
      },
      [handle, viewerUserId]
    )
  );

  useRealtimeEvent(
    'waitlist:updated',
    useCallback(
      (event) => {
        handle(event, applyWaitlistUpdated, waitlistUpdatedTouchesViewer);
      },
      [handle]
    )
  );
}
