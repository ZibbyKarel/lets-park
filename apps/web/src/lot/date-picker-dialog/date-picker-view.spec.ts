import { buildDatePickerGrid } from './date-picker-view';

/**
 * Unlike `./bulk-view.spec.ts`'s `buildMonthGrid`, there is no "which days
 * may be picked" suite here — every day this grid produces is selectable,
 * because `./date-picker-dialog.tsx` only navigates the lot screen, it never
 * books. What is worth asserting is the layout `./calendar-grid.ts` gives it
 * (Monday-first, padded to whole weeks) and the one fact this module adds:
 * which cell, if any, is the day currently open.
 */

function cells(grid: ReturnType<typeof buildDatePickerGrid>) {
  return grid.weeks
    .flatMap((week) => week.slots.map((slot) => slot.day))
    .filter((day) => day !== null);
}

describe('buildDatePickerGrid — the layout', () => {
  it('lays September 2026 out Monday-first, with the 1st (a Tuesday) one slot in', () => {
    const grid = buildDatePickerGrid('2026-09-15', '2026-09-15');
    const firstWeek = grid.weeks[0];
    expect(firstWeek?.slots[0]?.day).toBeNull();
    expect(firstWeek?.slots[1]?.day?.date).toBe('2026-09-01');
  });

  it('produces exactly the days in the month, none blocked', () => {
    const grid = buildDatePickerGrid('2026-09-15', '2026-09-15');
    expect(cells(grid)).toHaveLength(30);
  });
});

describe('buildDatePickerGrid — every day is selectable', () => {
  it('includes a past day', () => {
    const grid = buildDatePickerGrid('2026-01-15', '2026-06-01');
    expect(cells(grid).some((day) => day?.date === '2026-01-05')).toBe(true);
  });

  it('includes a weekend day', () => {
    // 2026-09-05 is a Saturday.
    const grid = buildDatePickerGrid('2026-09-15', '2026-09-15');
    expect(cells(grid).some((day) => day?.date === '2026-09-05')).toBe(true);
  });
});

describe('buildDatePickerGrid — which cell is selected', () => {
  it('marks the day matching selectedDate, and only that one', () => {
    const grid = buildDatePickerGrid('2026-09-15', '2026-09-15');
    const selected = cells(grid).filter((day) => day?.selected === true);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.date).toBe('2026-09-15');
  });

  it('marks no cell when selectedDate falls outside the browsed month', () => {
    const grid = buildDatePickerGrid('2026-09-15', '2026-10-05');
    expect(cells(grid).every((day) => day?.selected === false)).toBe(true);
  });
});
