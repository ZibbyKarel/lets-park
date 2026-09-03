'use client';

/**
 * Hromadná rezervace — the two-step bulk-booking modal
 * (`doc/design/screens/10-modal-bulk.png`, `doc/bulk-reservation-modal.md`).
 *
 * Step 1 picks days out of a month grid; step 2 shows the schedule
 * `reservation.previewBulk` proposes; confirming runs
 * `reservation.confirmBulk` and lands on a third, non-skippable step that
 * compares what happened against what was proposed.
 *
 * **The third step is the point.** `confirmBulk` deliberately leaves a race
 * open between its read and its write (`doc/decision/0092-*`), so a day the
 * preview promised a spot for can come back as a queue position. A modal that
 * proposed one thing and quietly confirmed another would be worse than one
 * with no proposal at all, because the user would believe they got what they
 * saw. See `doc/decision/0170-*`.
 *
 * Everything this file decides lives in `./bulk-view.ts`; everything it fetches
 * goes through `@lets-park/query` and `@lets-park/api-client`. Nothing here
 * names a wrapped package (`doc/wrappers.md`).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  formatDayAndMonth,
  formatFullDate,
  formatMonthLocative,
  formatWeekdayName,
  parseDateOnly,
  todayInPrague,
  useTranslations,
  type DateOnly,
} from '@lets-park/i18n';
import { useMutation, useQuery, useQueryClient } from '@lets-park/query';
import { Badge, Button, Modal, cx } from '@lets-park/design-system/primitives';
import type { BadgeTone } from '@lets-park/design-system/primitives';
import type { BulkDayPlan, ConfirmBulkOutput } from '@lets-park/contract';
import { useApi } from '../shell/api-provider';
import { useCurrentUser } from '../shell/use-current-user';
import {
  buildMonthGrid,
  diffBulkSchedule,
  toBadge,
  toBulkErrorMessageKey,
  toPreferredSpotView,
  toScheduleRows,
  type BulkBadgeView,
  type BulkDayCell,
  type BulkDayOutcomeView,
} from './bulk-view';

export interface BulkReservationModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Any day of the month the grid shows — the lot screen's own day. */
  readonly anchorDate: DateOnly;
  /**
   * `overview.day.canReserve` for {@link anchorDate}: the backend's answer to
   * "may this caller write in this window", never a re-derivation of it
   * (`doc/decision/0120-*`). The reservation window is monthly, and the grid
   * shows exactly that month, so the day's answer is the month's answer.
   *
   * **This is the block, not a hint.** The header hides its button when it is
   * `false`, but hiding a control is not enforcement — the window can also
   * close while the modal is already open, and then this prop is the only
   * thing standing between the user and a request the API will refuse. See
   * `doc/decision/0173-*`.
   */
  readonly canReserve: boolean;
}

const BADGE_TONES: Record<BulkBadgeView['kind'], BadgeTone> = {
  ASSIGNED_PREFERRED: 'success',
  ASSIGNED: 'info',
  QUEUED: 'warning',
  UNAVAILABLE: 'neutral',
};

/** Monday-first column heads, in the message catalog's key order. */
const WEEKDAY_KEYS = [
  'weekdayMon',
  'weekdayTue',
  'weekdayWed',
  'weekdayThu',
  'weekdayFri',
  'weekdaySat',
  'weekdaySun',
] as const;

export function BulkReservationModal({
  open,
  onClose,
  anchorDate,
  canReserve,
}: BulkReservationModalProps) {
  const t = useTranslations('bulk');
  const api = useApi();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<readonly DateOnly[]>([]);
  const [proposal, setProposal] = useState<readonly BulkDayPlan[] | null>(null);
  const [result, setResult] = useState<ConfirmBulkOutput | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const month = anchorDate.slice(0, 7);

  // A modal reopened on another month must not still be holding the previous
  // month's selection: the contract refuses a batch spanning two months, so a
  // stale day would turn the next confirmation into `VALIDATION_FAILED`.
  useEffect(() => {
    if (!open) {
      return;
    }
    setSelected([]);
    setProposal(null);
    setResult(null);
    setFailure(null);
  }, [open, month]);

  const profile = useCurrentUser();
  const spotList = useQuery({ ...api.spot.list.queryOptions(), enabled: open });
  const preferredSpot = toPreferredSpotView(
    profile.data === undefined ? undefined : profile.data.preferredParkingSpotId,
    spotList.data?.spots
  );

  const previewBulk = useMutation({
    ...api.reservation.previewBulk.mutationOptions(),
    onSuccess: (output) => {
      setFailure(null);
      setProposal(output.days);
    },
    onError: setFailure,
  });

  /**
   * Every day in the batch gets its `overview.day` entry invalidated, not just
   * the days that were written.
   *
   * Over-invalidating is nearly free — an unmounted query is only marked
   * stale — and the alternative needs the client to decide which days the
   * server changed, which is exactly the kind of re-derivation
   * `doc/decision/0120-*` rules out. A day reported `UNAVAILABLE` may still
   * have moved for another reason since the overview was read.
   *
   * The refetch is not redundant with the realtime broadcast: `canReserve` and
   * `viewerReservationId` are viewer-relative, and no broadcast can carry them
   * (the same reasoning as `LotScreen`'s `onMutationSuccess`).
   */
  const invalidateDays = useCallback(
    (dates: readonly DateOnly[]) => {
      for (const date of dates) {
        void queryClient.invalidateQueries({
          queryKey: api.overview.day.queryOptions({ input: { date } }).queryKey,
        });
      }
    },
    [api, queryClient]
  );

  const confirmBulk = useMutation({
    ...api.reservation.confirmBulk.mutationOptions(),
    onSuccess: (output) => {
      setFailure(null);
      setResult(output);
      invalidateDays(output.days.map((day) => day.date));
    },
    onError: setFailure,
  });

  const grid = buildMonthGrid(anchorDate, todayInPrague());
  const selectedSet = new Set(selected);

  const toggleDay = (cell: BulkDayCell) => {
    setSelected((current) =>
      current.includes(cell.date)
        ? current.filter((date) => date !== cell.date)
        : [...current, cell.date].sort()
    );
  };

  function badgeLabel(badge: BulkBadgeView): string {
    switch (badge.kind) {
      case 'ASSIGNED_PREFERRED':
        return t('badgeAssignedPreferred');
      case 'ASSIGNED':
        return t('badgeAssigned');
      case 'QUEUED':
        return t('badgeQueued', { position: badge.position });
      case 'UNAVAILABLE':
        switch (badge.reason) {
          case 'ALREADY_HAS_RESERVATION':
            return t('badgeAlreadyReserved');
          case 'NOT_A_BUSINESS_DAY':
            return t('badgeNotBusinessDay');
          case 'NO_SPOTS_AVAILABLE':
            return t('badgeNoSpots');
        }
    }
  }

  /** One side of a difference, as one readable phrase. */
  function describeOutcome(day: BulkDayOutcomeView | null): string {
    if (day === null) {
      return t('resultChangedMissing');
    }
    const label = badgeLabel(toBadge(day));
    return day.outcome === 'UNAVAILABLE' ? label : `${label} · ${day.parkingSpotLabel}`;
  }

  function preferredSpotNote(): string {
    switch (preferredSpot.kind) {
      case 'loading':
        return t('preferredSpotLoading');
      case 'none':
        return t('preferredSpotNone');
      case 'unavailable':
        return t('preferredSpotUnavailable');
      case 'named':
        return t('preferredSpot', { label: preferredSpot.label });
    }
  }

  function renderSchedule(days: readonly BulkDayOutcomeView[]) {
    const rows = toScheduleRows(days);
    if (rows.length === 0) {
      return <p className="text-base text-fg-3">{t('scheduleEmpty')}</p>;
    }
    return (
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.date}
            className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border px-4 py-3"
          >
            <span className="text-base text-fg">
              {formatDayAndMonth(row.date)} · {formatWeekdayName(row.date)}
            </span>
            <span className="flex items-center gap-3">
              {row.spotLabel === null ? null : (
                <span className="text-sm font-bold text-fg-2">{row.spotLabel}</span>
              )}
              <Badge tone={BADGE_TONES[row.badge.kind]}>{badgeLabel(row.badge)}</Badge>
            </span>
          </li>
        ))}
      </ul>
    );
  }

  const failureNote =
    failure === null ? null : (
      <p role="alert" className="mt-4 text-base text-danger">
        {t(toBulkErrorMessageKey(failure))}
      </p>
    );

  const pending = previewBulk.isPending || confirmBulk.isPending;

  // ---------------------------------------------------------------- blocked
  // Ahead of every step, so it also catches a window that closed while the
  // modal was open — the case a hidden header button cannot cover.
  if (!canReserve) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        size="md"
        title={t('lockedTitle')}
        closeLabel={t('close')}
        footer={
          <Button variant="secondary" onClick={onClose}>
            {t('close')}
          </Button>
        }
      >
        <p className="text-base leading-loose text-fg-3">{t('lockedDescription')}</p>
      </Modal>
    );
  }

  // ----------------------------------------------------------------- result
  if (result !== null) {
    const differences = diffBulkSchedule(proposal ?? [], result.days);
    return (
      <Modal
        open={open}
        onClose={onClose}
        size="md"
        title={t('resultTitle')}
        description={t('resultDescription')}
        closeLabel={t('close')}
        closeOnScrimClick={false}
        footer={<Button onClick={onClose}>{t('ctaDone')}</Button>}
      >
        {differences.length === 0 ? (
          <p role="status" className="mb-5 text-base text-fg-3">
            {t('resultUnchanged')}
          </p>
        ) : (
          <div
            role="alert"
            className="mb-5 rounded-md border border-brand-yellow bg-brand-yellow-100 px-4 py-3"
          >
            <p className="text-base font-bold text-fg">{t('resultChangedTitle')}</p>
            <p className="mt-1 text-base leading-loose text-fg-2">
              {t('resultChangedDescription')}
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {differences.map((difference) => (
                <li key={difference.date} className="text-base text-fg">
                  <span className="font-bold">
                    {formatDayAndMonth(difference.date)} · {formatWeekdayName(difference.date)}
                  </span>
                  <span className="block text-fg-2">
                    {t('resultChangedProposed')}: {describeOutcome(difference.proposed)}
                  </span>
                  <span className="block text-fg-2">
                    {t('resultChangedActual')}: {describeOutcome(difference.confirmed)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {renderSchedule(result.days)}

        <p className="mt-4 text-base text-fg-2">
          {t('scheduleSummary', {
            assigned: result.summary.assigned,
            queued: result.summary.queued,
          })}
        </p>
      </Modal>
    );
  }

  // --------------------------------------------------------------- schedule
  if (proposal !== null) {
    const assigned = proposal.filter((day) => day.outcome === 'SPOT_ASSIGNED').length;
    const queued = proposal.filter((day) => day.outcome === 'QUEUED').length;

    return (
      <Modal
        open={open}
        onClose={onClose}
        size="md"
        title={t('scheduleTitle')}
        description={t('scheduleDescription')}
        closeLabel={t('close')}
        closeOnScrimClick={false}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setProposal(null);
                setFailure(null);
              }}
            >
              {t('ctaBack')}
            </Button>
            <Button
              loading={confirmBulk.isPending}
              disabled={pending}
              onClick={() => {
                confirmBulk.mutate({ dates: [...selected] });
              }}
            >
              {t('ctaConfirm')}
            </Button>
          </>
        }
      >
        {renderSchedule(proposal)}
        <p className="mt-4 text-base text-fg-2">{t('scheduleSummary', { assigned, queued })}</p>
        {failureNote}
      </Modal>
    );
  }

  // ----------------------------------------------------------------- select
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={t('title')}
      description={t('description', {
        month: formatMonthLocative(parseDateOnly(anchorDate).month),
      })}
      closeLabel={t('close')}
      closeOnScrimClick={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('close')}
          </Button>
          <Button
            loading={previewBulk.isPending}
            disabled={selected.length === 0 || pending}
            onClick={() => {
              previewBulk.mutate({ dates: [...selected] });
            }}
          >
            {selected.length === 0
              ? t('ctaSelectDays')
              : t('ctaGenerate', { count: selected.length })}
          </Button>
        </>
      }
    >
      <table className="w-full border-separate border-spacing-2">
        <caption className="sr-only">{t('gridLabel')}</caption>
        <thead>
          <tr>
            {WEEKDAY_KEYS.map((key) => (
              <th
                key={key}
                scope="col"
                className="pb-1 text-xs font-bold uppercase tracking-caps text-fg-3"
              >
                {t(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.weeks.map((week) => (
            <tr key={week.key}>
              {week.slots.map(({ key, day }) =>
                day === null ? (
                  <td key={key} />
                ) : (
                  <td key={key}>
                    <button
                      type="button"
                      disabled={!day.selectable}
                      aria-pressed={day.selectable ? selectedSet.has(day.date) : undefined}
                      aria-label={
                        day.selectable
                          ? t('dayCell', { date: formatFullDate(day.date) })
                          : t('dayCellBlocked', { date: formatFullDate(day.date) })
                      }
                      onClick={() => {
                        toggleDay(day);
                      }}
                      className={cx(
                        'h-[var(--control-h-lg)] w-full rounded-sm border text-base font-bold',
                        'transition duration-[var(--dur-base)] ease-out',
                        'outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
                        'focus-visible:outline-brand-blue',
                        day.selectable
                          ? selectedSet.has(day.date)
                            ? 'cursor-pointer border-brand-blue bg-brand-blue text-fg-on-blue'
                            : 'cursor-pointer border-border bg-bg text-fg hover:bg-bg-muted'
                          : 'cursor-default border-transparent bg-bg-soft text-fg-3'
                      )}
                    >
                      {day.dayOfMonth}
                    </button>
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-3">
        <span>{t('nonSelectableNote')}</span>
        <span className="font-bold text-fg">{preferredSpotNote()}</span>
      </p>

      {failureNote}
    </Modal>
  );
}
