import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider, formatFullDate } from '@lets-park/i18n';
import { LotHeader } from './lot-header';
import type { DayNoteView } from '../lot-view';

/**
 * `LotHeader` is pure presentation, same as every other piece `./lot-header.tsx`
 * draws: every decision the brief cares about is made elsewhere and handed in
 * as a prop. This suite checks it renders what it is given and reports every
 * control back through its callback, never a raw DOM event — the same
 * contract the sticky bar's own suite once checked, before `LotHeader`
 * absorbed it (`doc/decision/0140-*` revisited).
 */

const DATE = '2026-09-28';

function workdayNote(): DayNoteView {
  return { key: 'workday', name: '', highlighted: false };
}

function holidayNote(name = 'Den české státnosti'): DayNoteView {
  return { key: 'holiday', name, highlighted: true };
}

function weekendNote(): DayNoteView {
  return { key: 'weekend', name: '', highlighted: true };
}

function renderHeader(
  overrides: {
    date?: string;
    note?: DayNoteView;
    counts?: { free: number; taken: number };
    showBulk?: boolean;
  } = {}
) {
  const onBulk = jest.fn();
  const onPreviousDay = jest.fn();
  const onNextDay = jest.fn();
  const onToday = jest.fn();
  const onOpenDatePicker = jest.fn();

  const utils = render(
    <IntlProvider>
      <LotHeader
        date={overrides.date ?? DATE}
        note={overrides.note ?? workdayNote()}
        counts={overrides.counts ?? { free: 4, taken: 5 }}
        sectionTitle="Přehled parkoviště"
        showBulk={overrides.showBulk ?? true}
        onBulk={onBulk}
        onPreviousDay={onPreviousDay}
        onNextDay={onNextDay}
        onToday={onToday}
        onOpenDatePicker={onOpenDatePicker}
      />
    </IntlProvider>
  );

  return {
    ...utils,
    onBulk,
    onPreviousDay,
    onNextDay,
    onToday,
    onOpenDatePicker,
    user: userEvent.setup(),
  };
}

describe('LotHeader — the accessible title and the date pill', () => {
  it('carries the section title on a hidden heading, not the visible date', () => {
    renderHeader();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Přehled parkoviště');
  });

  it('shows the date, through the same formatter the old heading used', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: formatFullDate(DATE) })).toBeInTheDocument();
  });
});

describe('LotHeader — controls report parsed values, not raw events', () => {
  it('calls onPreviousDay from the left arrow', async () => {
    const { onPreviousDay, user } = renderHeader();
    await user.click(screen.getByRole('button', { name: 'Předchozí den' }));
    expect(onPreviousDay).toHaveBeenCalledTimes(1);
  });

  it('calls onNextDay from the right arrow', async () => {
    const { onNextDay, user } = renderHeader();
    await user.click(screen.getByRole('button', { name: 'Následující den' }));
    expect(onNextDay).toHaveBeenCalledTimes(1);
  });

  it('calls onToday from the "Dnes" button', async () => {
    const { onToday, user } = renderHeader();
    await user.click(screen.getByRole('button', { name: 'Dnes' }));
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it('opens the date picker from the date pill', async () => {
    const { onOpenDatePicker, user } = renderHeader();
    await user.click(screen.getByRole('button', { name: formatFullDate(DATE) }));
    expect(onOpenDatePicker).toHaveBeenCalledTimes(1);
  });
});

describe('LotHeader — the holiday/weekend note', () => {
  it('names it a working day, on an ordinary weekday', () => {
    renderHeader({ note: workdayNote() });
    expect(screen.getByText('Pracovní den')).toBeInTheDocument();
  });

  it('names the holiday on a public holiday', () => {
    renderHeader({ note: holidayNote('Den české státnosti') });
    expect(screen.getByText('Státní svátek · Den české státnosti')).toBeInTheDocument();
  });

  it('names it a weekend, with no holiday name to show', () => {
    renderHeader({ note: weekendNote() });
    expect(screen.getByText('Víkend')).toBeInTheDocument();
  });
});

describe('LotHeader — the occupancy pill and the bulk button', () => {
  it('reads the taken and total counts off one combined pill', () => {
    renderHeader({ counts: { free: 4, taken: 5 } });
    expect(screen.getByText('5 z 9 obsazeno')).toBeInTheDocument();
  });

  it('shows the bulk-reservation button when the month allows it', () => {
    renderHeader({ showBulk: true });
    expect(screen.getByRole('button', { name: 'Hromadná rezervace' })).toBeInTheDocument();
  });

  it('hides the bulk-reservation button — absent, not disabled — otherwise', () => {
    renderHeader({ showBulk: false });
    expect(screen.queryByRole('button', { name: 'Hromadná rezervace' })).not.toBeInTheDocument();
  });

  it('calls onBulk when the button is clicked', async () => {
    const { onBulk, user } = renderHeader({ showBulk: true });
    await user.click(screen.getByRole('button', { name: 'Hromadná rezervace' }));
    expect(onBulk).toHaveBeenCalledTimes(1);
  });
});
