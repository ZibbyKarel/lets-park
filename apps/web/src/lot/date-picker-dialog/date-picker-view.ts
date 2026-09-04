/**
 * The pure half of {@link DatePickerDialog} — Claude Design's `Lets Park.dc.html`
 * (`datePickerOpen` branch), which browses a month grid to jump the lot
 * screen to any day.
 *
 * Unlike `../bulk-modal/bulk-view.ts`'s grid, every day here is selectable: this picker
 * only navigates, it never books, so a past day, a weekend or a holiday is as
 * pickable as any other. `../calendar-grid.ts` supplies the week layout both
 * grids share; this module supplies the one fact its cells carry — is this
 * the day currently open on the lot screen.
 */

import { compareDateOnly, parseDateOnly, type DateOnly } from '@lets-park/i18n';
import { buildCalendarGrid, type CalendarGrid } from '../calendar-grid';

export interface DatePickerDayCell {
  readonly date: DateOnly;
  readonly dayOfMonth: number;
  readonly selected: boolean;
}

export type DatePickerGrid = CalendarGrid<DatePickerDayCell>;

/** The month containing `anchor`, with `selectedDate` marked if it falls in it. */
export function buildDatePickerGrid(anchor: DateOnly, selectedDate: DateOnly): DatePickerGrid {
  return buildCalendarGrid(anchor, (date) => ({
    date,
    dayOfMonth: parseDateOnly(date).day,
    selected: compareDateOnly(date, selectedDate) === 0,
  }));
}
