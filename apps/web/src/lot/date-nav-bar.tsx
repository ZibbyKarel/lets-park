'use client';

/**
 * {@link DayBar} — the fixed date-navigation bar at the bottom of the lot
 * screen (Task 25, `doc/design/screens/07-lot.png` and `13-lot-user-bottom.png`).
 *
 * Purely presentational, like every other piece in `./lot-header`: it draws
 * whatever `date`/`note`/`month`/`year`/`years` it is given and reports every
 * interaction through a callback, exactly the shape `LotScreen` already wires
 * up. It has its own file — rather than living alongside `LotHeader` — solely
 * so Task 31's bulk-reservation work, landing on `lot-screen.tsx` at the same
 * time, never has to touch a file this task owns (`doc/decision/0140-*`).
 *
 * The Czech public-holiday/weekend highlighting the brief calls out is not
 * decided here: `note: DayNoteView` already carries the answer, computed by
 * `toDayNoteView` in `./lot-view` from `@lets-park/i18n`'s holiday calendar.
 * This component only chooses which classes and copy that answer maps to.
 */

import { Button, Select, Stack, cx } from '@lets-park/design-system/primitives';
import { formatFullDate, formatMonthName, useTranslations } from '@lets-park/i18n';
import type { DateOnly } from '@lets-park/i18n';
import type { DayNoteView } from './lot-view';

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
    <Stack
      direction="row"
      align="center"
      justify="center"
      wrap
      spacing={4}
      className={cx(
        'sticky bottom-0 z-[var(--z-sticky)] mt-6 rounded-md border px-4 py-4',
        note.highlighted ? 'border-brand-yellow bg-brand-yellow-100' : 'border-border bg-bg'
      )}
    >
      <Stack direction="row" align="center" spacing={3}>
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
      </Stack>

      <Stack direction="row" align="center" spacing={3}>
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
      </Stack>
    </Stack>
  );
}
