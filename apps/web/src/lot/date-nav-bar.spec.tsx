import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider, formatFullDate, formatMonthName } from '@lets-park/i18n';
import { DayBar } from './date-nav-bar';
import type { DayNoteView } from './lot-view';

/**
 * `DayBar` is pure presentation: every decision the brief cares about — is
 * this a public holiday, a weekend, an ordinary working day — is made once by
 * `toDayNoteView` (`lot-view.spec.ts`) and handed in as `note`. This suite
 * only checks that `DayBar` renders what a given `note` says and reports
 * every control back through its callbacks with the right, already-parsed
 * argument — never a raw DOM event.
 */

const DATE = '2026-09-28';
const YEARS = [2025, 2026, 2027] as const;

function workdayNote(): DayNoteView {
  return { key: 'workday', name: '', highlighted: false };
}

function holidayNote(name = 'Den české státnosti'): DayNoteView {
  return { key: 'holiday', name, highlighted: true };
}

function weekendNote(): DayNoteView {
  return { key: 'weekend', name: '', highlighted: true };
}

function renderBar(
  overrides: {
    note?: DayNoteView;
    date?: string;
    month?: number;
    year?: number;
    years?: readonly number[];
  } = {}
) {
  const onPreviousDay = jest.fn();
  const onNextDay = jest.fn();
  const onToday = jest.fn();
  const onMonth = jest.fn();
  const onYear = jest.fn();

  const utils = render(
    <IntlProvider>
      <DayBar
        date={overrides.date ?? DATE}
        note={overrides.note ?? workdayNote()}
        month={overrides.month ?? 9}
        year={overrides.year ?? 2026}
        years={overrides.years ?? YEARS}
        onPreviousDay={onPreviousDay}
        onNextDay={onNextDay}
        onToday={onToday}
        onMonth={onMonth}
        onYear={onYear}
      />
    </IntlProvider>
  );

  return {
    ...utils,
    onPreviousDay,
    onNextDay,
    onToday,
    onMonth,
    onYear,
    user: userEvent.setup(),
  };
}

describe('DayBar — date and pickers', () => {
  it('renders the date through the same formatter the heading uses', () => {
    renderBar();
    expect(screen.getByText(formatFullDate(DATE))).toBeInTheDocument();
  });

  it('offers every month of the year, by name', () => {
    renderBar();
    for (let month = 1; month <= 12; month += 1) {
      expect(screen.getByRole('option', { name: formatMonthName(month) })).toBeInTheDocument();
    }
  });

  it('offers exactly the years it was given', () => {
    renderBar({ years: [2024, 2026] });
    expect(screen.getByRole('option', { name: '2024' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '2026' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '2025' })).not.toBeInTheDocument();
  });
});

describe('DayBar — controls report parsed values, not raw events', () => {
  it('calls onPreviousDay from the left arrow', async () => {
    const { onPreviousDay, user } = renderBar();
    await user.click(screen.getByRole('button', { name: 'Předchozí den' }));
    expect(onPreviousDay).toHaveBeenCalledTimes(1);
  });

  it('calls onNextDay from the right arrow', async () => {
    const { onNextDay, user } = renderBar();
    await user.click(screen.getByRole('button', { name: 'Následující den' }));
    expect(onNextDay).toHaveBeenCalledTimes(1);
  });

  it('calls onToday from the "Dnes" button', async () => {
    const { onToday, user } = renderBar();
    await user.click(screen.getByRole('button', { name: 'Dnes' }));
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it('reports the chosen month as a number', async () => {
    const { onMonth, user } = renderBar();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Měsíc' }), formatMonthName(3));
    expect(onMonth).toHaveBeenCalledWith(3);
  });

  it('reports the chosen year as a number', async () => {
    const { onYear, user } = renderBar();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rok' }), '2027');
    expect(onYear).toHaveBeenCalledWith(2027);
  });
});

describe('DayBar — the holiday/weekend highlight', () => {
  it('stays neutral, and names it a working day, on an ordinary weekday', () => {
    const { container } = renderBar({ note: workdayNote() });
    expect(container.firstElementChild).toHaveClass('border-border', 'bg-bg');
    expect(container.firstElementChild).not.toHaveClass('border-brand-yellow');
    expect(screen.getByText('Pracovní den')).toBeInTheDocument();
  });

  it('turns yellow and names the holiday on a public holiday', () => {
    const { container } = renderBar({ note: holidayNote('Den české státnosti') });
    expect(container.firstElementChild).toHaveClass('border-brand-yellow', 'bg-brand-yellow-100');
    expect(screen.getByText('Státní svátek · Den české státnosti')).toBeInTheDocument();
  });

  it('turns yellow on a weekend too, with no holiday name to show', () => {
    const { container } = renderBar({ note: weekendNote() });
    expect(container.firstElementChild).toHaveClass('border-brand-yellow', 'bg-brand-yellow-100');
    expect(screen.getByText('Víkend')).toBeInTheDocument();
  });
});
