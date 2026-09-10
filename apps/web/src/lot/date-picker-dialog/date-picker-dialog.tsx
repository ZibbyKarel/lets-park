'use client';

/**
 * {@link DatePickerDialog} — the calendar the header's date pill opens
 * (`doc/design/lets-park-design.dc.html`'s `datePickerOpen` branch).
 *
 * The grid itself borrows `../bulk-modal/bulk-modal.tsx`'s table: a `<caption>` for the
 * accessible name, weekday heads, and a button per day. What differs is the
 * rule a cell obeys — since this dialog only navigates the lot screen and
 * never books, a past day or a Czech holiday is pickable here, with weekends
 * the one exception (see `./date-picker-view.ts`) — which is exactly why the
 * layout moved to `../calendar-grid.ts` rather than this file reaching into
 * `../bulk-modal/bulk-view.ts` for a grid shaped by booking rules that do not apply here.
 *
 * Picking a day calls `onSelect` with nothing further: the caller (`../lot-header/lot-header.tsx`
 * via `../lot-screen/lot-screen.tsx`) decides that choosing a day also closes the dialog,
 * the same way a click in `../bulk-modal/bulk-modal.tsx`'s grid never closes anything —
 * the two dialogs simply differ on that point, and neither should guess the
 * other's convention.
 */

import { useState } from 'react';
import { Button, Modal, Select, Stack, cx } from '@lets-park/design-system/primitives';
import {
  addMonths,
  parseDateOnly,
  startOfMonth,
  useDateFormatters,
  useTranslations,
  type DateOnly,
} from '@lets-park/i18n';
import { buildDatePickerGrid } from './date-picker-view';

export interface DatePickerDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The lot screen's own day — seeds the month on open and marks its cell. */
  readonly selectedDate: DateOnly;
  /** Years offered in the year selector, ascending. */
  readonly years: readonly number[];
  readonly onSelect: (date: DateOnly) => void;
}

const MONTHS_IN_YEAR = 12;

/**
 * Keyed on `open` and `selectedDate` for the same reason
 * `BulkReservationModal` keys its content on opening: a passive effect
 * resetting the browsed month would still see the previous state in the
 * render where `open` flips back to `true`, and re-mounting avoids that class
 * of bug by construction instead of by effect ordering
 * (`doc/decision/0258-*`).
 */
export function DatePickerDialog(props: DatePickerDialogProps) {
  return <DatePickerDialogContent key={`${String(props.open)}-${props.selectedDate}`} {...props} />;
}

function DatePickerDialogContent({
  open,
  onClose,
  selectedDate,
  years,
  onSelect,
}: DatePickerDialogProps) {
  const t = useTranslations('lot');
  const f = useDateFormatters();
  const [viewAnchor, setViewAnchor] = useState<DateOnly>(() => startOfMonth(selectedDate));

  const grid = buildDatePickerGrid(viewAnchor, selectedDate);
  const parts = parseDateOnly(viewAnchor);

  const WEEKDAY_KEYS = [
    'weekdayMon',
    'weekdayTue',
    'weekdayWed',
    'weekdayThu',
    'weekdayFri',
    'weekdaySat',
    'weekdaySun',
  ] as const;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t('datePickerTitle')}
      closeLabel={t('close')}
    >
      <Stack direction="row" align="center" spacing={2} className="mb-4">
        <Button
          variant="outline"
          size="sm"
          aria-label={t('previousDay')}
          onClick={() => {
            setViewAnchor((current) => addMonths(current, -1));
          }}
        >
          ‹
        </Button>
        <Select
          aria-label={t('monthLabel')}
          value={String(parts.month)}
          onChange={(event) => {
            setViewAnchor((current) =>
              addMonths(current, Number(event.target.value) - parts.month)
            );
          }}
          className="flex-1"
        >
          {Array.from({ length: MONTHS_IN_YEAR }, (_unused, index) => index + 1).map((month) => (
            <option key={month} value={month}>
              {f.monthName(month)}
            </option>
          ))}
        </Select>
        <Select
          aria-label={t('yearLabel')}
          value={String(parts.year)}
          onChange={(event) => {
            setViewAnchor((current) =>
              addMonths(current, (Number(event.target.value) - parts.year) * MONTHS_IN_YEAR)
            );
          }}
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </Select>
        <Button
          variant="outline"
          size="sm"
          aria-label={t('nextDay')}
          onClick={() => {
            setViewAnchor((current) => addMonths(current, 1));
          }}
        >
          ›
        </Button>
      </Stack>

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
                      aria-pressed={day.selectable ? day.selected : undefined}
                      aria-label={
                        day.selectable
                          ? t('dayCell', { date: f.fullDate(day.date) })
                          : t('dayCellBlocked', { date: f.fullDate(day.date) })
                      }
                      onClick={() => {
                        onSelect(day.date);
                      }}
                      className={cx(
                        'h-[var(--control-h-lg)] w-full rounded-sm border text-base font-bold',
                        'outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
                        'focus-visible:outline-brand-blue',
                        day.selectable
                          ? day.selected
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
    </Modal>
  );
}
