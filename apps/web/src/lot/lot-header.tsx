'use client';

/**
 * Everything above the map, and the bar below it. All presentational.
 *
 * - {@link LotHeader} — the section eyebrow, the day as a heading, the two
 *   count pills and the bulk-reservation button;
 * - {@link WindowBanner} — the one true sentence about the month's window;
 * - {@link RealtimeNotice} — the affordance for a refused socket;
 * - {@link DayBar} — the sticky day picker from the bottom of the design.
 */

import { Button, Select, cx } from '@lets-park/design-system/primitives';
import { formatFullDate, formatMonthName, useTranslations } from '@lets-park/i18n';
import type { DateOnly } from '@lets-park/i18n';
import type { BannerView, DayNoteView, LotCounts } from './lot-view';

export interface LotHeaderProps {
  readonly date: DateOnly;
  readonly counts: LotCounts;
  readonly sectionTitle: string;
  /**
   * `windowOpen || admin` — the design's `batchAllowed`. When it is false the
   * button is **absent**, not disabled: a normal user in a locked month has no
   * bulk action to take, and a greyed-out control invites a click that will
   * only ever be refused.
   */
  readonly showBulk: boolean;
  readonly onBulk: () => void;
}

export function LotHeader({
  date,
  counts,
  sectionTitle,
  showBulk,
  onBulk,
}: LotHeaderProps) {
  const t = useTranslations('lot');

  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-6">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-caps text-fg-2">{sectionTitle}</p>
        <h1 className="text-4xl font-bold leading-tight tracking-tight text-fg">
          {formatFullDate(date)}
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <p className="flex h-9 items-center gap-2 rounded-cta border border-border bg-bg px-4 text-base">
          <span aria-hidden="true" className="size-2 rounded-cta bg-car-2" />
          {t('freeCount', { count: counts.free })}
        </p>
        <p className="flex h-9 items-center gap-2 rounded-cta border border-border bg-bg px-4 text-base">
          <span aria-hidden="true" className="size-2 rounded-cta bg-car-3" />
          {t('takenCount', { count: counts.taken })}
        </p>
        {showBulk ? (
          <Button size="sm" onClick={onBulk}>
            {t('bulkReservation')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The status banner above the map.
 *
 * There is always exactly one: `overview.day` always carries a `window`, and
 * each of its three states has one true sentence. See `doc/decision/0122-*`
 * for why the design's `showLockState` prototype prop is not a hiding rule.
 *
 * `role="status"` so a screen reader is told when the window changes under a
 * page that is already open — which an admin flipping `lockMode` does, through
 * a refetch, without the user navigating anywhere.
 */
export function WindowBanner({ banner }: { readonly banner: BannerView }) {
  const t = useTranslations('lot');
  const isSuccess = banner.tone === 'success';

  return (
    <div
      role="status"
      className={cx(
        'mb-5 flex items-center gap-3 rounded-md border px-4 py-3',
        isSuccess
          ? 'border-brand-green bg-brand-green-100'
          : 'border-brand-yellow bg-brand-yellow-100'
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'inline-flex size-6 shrink-0 items-center justify-center rounded-xs text-sm font-bold',
          isSuccess ? 'bg-brand-green text-fg-on-green' : 'bg-brand-yellow text-fg-on-yellow'
        )}
      >
        {isSuccess ? '✓' : '⊘'}
      </span>
      <p className="text-base leading-snug text-fg">{t(banner.messageKey, banner.values)}</p>
    </div>
  );
}

/**
 * The socket was refused and has stopped retrying.
 *
 * `doc/decision/0061-*` makes a refused handshake terminal for that socket and
 * bounds the automatic retries, precisely so a page cannot sit forever
 * presenting a credential the gateway has already rejected. That leaves the
 * user with a grid that has silently stopped updating unless something says
 * so — which is this. The button is the intended caller of the connection's
 * unconditional `reconnect()`.
 */
export function RealtimeNotice({ onReconnect }: { readonly onReconnect: () => void }) {
  const t = useTranslations('lot');

  return (
    <div
      role="status"
      className="mb-5 flex flex-wrap items-center gap-3 rounded-md border border-brand-yellow bg-brand-yellow-100 px-4 py-3"
    >
      <p className="flex-1 text-base leading-snug text-fg">{t('realtimeRejected')}</p>
      <Button variant="secondary" size="sm" onClick={onReconnect}>
        {t('realtimeReconnect')}
      </Button>
    </div>
  );
}

export interface DayBarProps {
  readonly date: DateOnly;
  readonly note: DayNoteView;
  /** 1-based, matching `DateParts.month`. */
  readonly month: number;
  readonly year: number;
  /** Years offered in the picker, ascending. */
  readonly years: readonly number[];
  readonly onPreviousDay: () => void;
  readonly onNextDay: () => void;
  readonly onToday: () => void;
  readonly onMonth: (month: number) => void;
  readonly onYear: (year: number) => void;
}

const MONTHS_IN_YEAR = 12;

/**
 * The sticky picker at the bottom of the design.
 *
 * It turns yellow on a day that is not an ordinary working day, which is the
 * design's treatment for a public holiday and — see
 * `toDayNoteView` — for a weekend too. That is the only place on the screen
 * that explains why every tile on such a day is `⊘`: `canReserve` is false
 * because `isBusinessDay` refused the date, not because the window is shut.
 */
export function DayBar({
  date,
  note,
  month,
  year,
  years,
  onPreviousDay,
  onNextDay,
  onToday,
  onMonth,
  onYear,
}: DayBarProps) {
  const t = useTranslations('lot');

  return (
    <div
      className={cx(
        'sticky bottom-0 z-[var(--z-sticky)] mt-6 flex flex-wrap items-center justify-center',
        'gap-4 rounded-md border px-4 py-4',
        note.highlighted ? 'border-brand-yellow bg-brand-yellow-100' : 'border-border bg-bg'
      )}
    >
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" aria-label={t('previousDay')} onClick={onPreviousDay}>
          ‹
        </Button>
        <div className="text-center">
          <p className="text-base font-bold text-fg">{formatFullDate(date)}</p>
          <p
            className={cx(
              'text-xs font-bold uppercase tracking-caps',
              note.highlighted ? 'text-fg' : 'text-fg-3'
            )}
          >
            {t(note.key, { name: note.name })}
          </p>
        </div>
        <Button variant="outline" size="sm" aria-label={t('nextDay')} onClick={onNextDay}>
          ›
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Select
          aria-label={t('monthLabel')}
          value={String(month)}
          onChange={(event) => {
            onMonth(Number(event.target.value));
          }}
        >
          {Array.from({ length: MONTHS_IN_YEAR }, (_unused, index) => index + 1).map((value) => (
            <option key={value} value={value}>
              {formatMonthName(value)}
            </option>
          ))}
        </Select>
        <Select
          aria-label={t('yearLabel')}
          value={String(year)}
          onChange={(event) => {
            onYear(Number(event.target.value));
          }}
        >
          {years.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
        <Button variant="outline" size="sm" onClick={onToday}>
          {t('today')}
        </Button>
      </div>
    </div>
  );
}
