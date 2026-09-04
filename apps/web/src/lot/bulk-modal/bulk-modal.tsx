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

import { useCallback, useState } from 'react';
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
import { Badge, Box, Button, Modal, cx } from '@lets-park/design-system/primitives';
import type { BadgeTone } from '@lets-park/design-system/primitives';
import type { ConfirmBulkOutput, PreviewBulkOutput } from '@lets-park/contract';
import { useApi } from '../../shell/api-provider/api-provider';
import { useCurrentUser } from '../../shell/use-current-user';
import {
  buildMonthGrid,
  diffBulkSchedule,
  toBadge,
  toBadgeMessage,
  toBulkErrorMessageKey,
  toPreferredSpotMessage,
  toPreferredSpotView,
  toScheduleRows,
  weekendColumns,
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
   * `overview.day.canReserveMonth` for {@link anchorDate}'s month: the
   * backend's answer to "may this caller create reservations anywhere in this
   * month", never a re-derivation of it (`doc/decision/0120-*`).
   *
   * **`canReserve` is the wrong field here and was the wrong field once.** That
   * one is per-**day** — a past day, a weekend and a Czech public holiday all
   * make it `false` while leaving the month wide open — so reading it switched
   * bulk booking off on roughly a third of the calendar, including the very
   * holiday the design's own screenshot shows the modal open on
   * (`doc/decision/0175-*`).
   *
   * **This is the block, not a hint.** The header hides its button when it is
   * `false`, but hiding a control is not enforcement — the window can also
   * close while the modal is already open, and then this prop is the only
   * thing standing between the user and a request the API will refuse. What it
   * must never block is the *result* step: see `doc/decision/0176-*`.
   */
  readonly canReserveMonth: boolean;
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

/**
 * The modal, with its state tied to one opening.
 *
 * The reset used to be a `useEffect` on `[open, month]` inside the component
 * below. Passive effects run **after paint**, so the render in which `open`
 * flips back to `true` still saw the previous run's `result` and took the
 * result branch — the user reopening the modal got a frame of the last batch's
 * outcome before the day grid appeared. See `doc/decision/0258-*`.
 *
 * A `key` fixes it by construction rather than by ordering: React discards the
 * whole subtree and mounts a fresh one, so there is no state left to flash and
 * no effect whose timing has to be right. The month is in the key as well as
 * `open` because the contract refuses a batch spanning two months — a stale
 * day from the previous month would turn the next confirmation into
 * `VALIDATION_FAILED`. (`LotScreen` also closes the modal when the day moves,
 * so that half is belt and braces; it is cheap and it is the rule this file
 * actually depends on.)
 */
export function BulkReservationModal(props: BulkReservationModalProps) {
  return (
    <BulkReservationModalContent
      key={`${String(props.open)}-${props.anchorDate.slice(0, 7)}`}
      {...props}
    />
  );
}

function BulkReservationModalContent({
  open,
  onClose,
  anchorDate,
  canReserveMonth,
}: BulkReservationModalProps) {
  const t = useTranslations('bulk');
  const api = useApi();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<readonly DateOnly[]>([]);
  // The **whole** preview output, not just its days: its `summary` is the
  // server's own count and is what step 2 prints, so the two steps quote the
  // same authority instead of one of them re-deriving it from `days`.
  const [proposal, setProposal] = useState<PreviewBulkOutput | null>(null);
  const [result, setResult] = useState<ConfirmBulkOutput | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  // No reset effect here on purpose — the wrapper above keys this component on
  // `open` and the month, so every opening is a fresh mount and the four
  // `useState`s start at their initial values. An effect could only ever undo
  // the previous run's state *after* the reopening render had already used it.

  const profile = useCurrentUser();
  const spotList = useQuery({ ...api.spot.list.queryOptions(), enabled: open });
  const preferredSpot = toPreferredSpotView(
    profile.data === undefined ? undefined : profile.data.preferredParkingSpotId,
    spotList.data?.spots,
    // `data` is `undefined` both in flight and after a failure, so the error
    // flags are the only thing that tells the two apart.
    profile.isError || spotList.isError
  );

  const previewBulk = useMutation({
    ...api.reservation.previewBulk.mutationOptions(),
    onSuccess: (output) => {
      setFailure(null);
      setProposal(output);
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
  const weekendHeads = weekendColumns(grid);
  const selectedSet = new Set(selected);

  const toggleDay = (cell: BulkDayCell) => {
    setSelected((current) =>
      current.includes(cell.date)
        ? current.filter((date) => date !== cell.date)
        : [...current, cell.date].sort()
    );
  };

  function badgeLabel(badge: BulkBadgeView): string {
    const message = toBadgeMessage(badge);
    return t(message.messageKey, message.values);
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
    const message = toPreferredSpotMessage(preferredSpot);
    return t(message.messageKey, message.values);
  }

  // No empty-list branch: both procedures answer one entry per requested day
  // and the call to action is disabled at zero selection, so `rows` cannot be
  // empty. A branch that cannot render is copy nobody will ever proof-read
  // (`doc/decision/0021-*`'s unreachable-member rule, applied to a catalog).
  // Only a preview that filtered days out of its response would change that.
  function renderSchedule(days: readonly BulkDayOutcomeView[]) {
    const rows = toScheduleRows(days);
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

  // ----------------------------------------------------------------- result
  //
  // **First, ahead of the locked-month refusal below.** A result is a record of
  // writes that already happened; there is nothing left here for a closed
  // window to block, and refusing at this point would replace the comparison
  // with "hromadnou rezervaci teď založit nelze" over reservations that exist —
  // the exact silent difference the whole two-step flow is built to prevent.
  // The confirm button does not exist on this step, so nothing is weakened by
  // letting it through. See `doc/decision/0176-*`.
  if (result !== null) {
    const differences = diffBulkSchedule(proposal?.days ?? [], result.days);
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
          <Box
            role="alert"
            radius="md"
            padding={[3, 4]}
            className="mb-5 border border-brand-yellow bg-brand-yellow-100"
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
          </Box>
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

  // ---------------------------------------------------------------- blocked
  //
  // Ahead of the two steps that can still *write* — picking days and
  // confirming — so it catches both a modal opened in a locked month and a
  // window that closes while the modal is open, which is the case a hidden
  // header button cannot cover. Deliberately **after** the result step above.
  if (!canReserveMonth) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        size="md"
        title={t('lockedTitle')}
        closeLabel={t('close')}
        // Consistent with the three flow steps: whichever of them this replaced
        // was holding a selection, and a stray click on the scrim should not be
        // how the user finds that out.
        closeOnScrimClick={false}
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

  // --------------------------------------------------------------- schedule
  if (proposal !== null) {
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
                // The days of the **proposal on screen**, not of `selected`.
                // They agree today, because both procedures answer one entry
                // per requested day — but "we confirm exactly what you were
                // shown" is the invariant, and reading it off the thing that
                // was shown is the only way to state it.
                confirmBulk.mutate({ dates: proposal.days.map((day) => day.date) });
              }}
            >
              {t('ctaConfirm')}
            </Button>
          </>
        }
      >
        {renderSchedule(proposal.days)}
        <p className="mt-4 text-base text-fg-2">
          {/*
            The server's own count, exactly as the result step uses
            `result.summary`. Re-deriving it here by filtering `days` would put
            two authorities behind one sentence, and the moment they disagreed
            the user would read a difference between the two steps that the
            comparison panel cannot explain, because no day moved.
          */}
          {t('scheduleSummary', {
            assigned: proposal.summary.assigned,
            queued: proposal.summary.queued,
          })}
        </p>
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
            {WEEKDAY_KEYS.map((key, column) => (
              <th
                key={key}
                scope="col"
                className={cx(
                  'pb-1 text-xs font-bold uppercase tracking-caps',
                  // "Víkendy vizuálně v zákrytu vpravo" — the design draws the
                  // SO/NE heads a step lighter than PO–PÁ, which is what makes
                  // the weekend boundary readable at a glance. Which columns
                  // those are is read off the grid, never spelled out twice.
                  weekendHeads[column] === true ? 'text-neutral-400' : 'text-fg-3'
                )}
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
