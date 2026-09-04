import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DayOverviewOutput, DaySpotOverview } from '@lets-park/contract';
import { IntlProvider } from '@lets-park/i18n';
import { AdminDayScreen } from './admin-day-screen';
import type { AdminDayScreenProps } from './admin-day-screen';

const TIMESTAMP = '2026-09-28T06:00:00.000Z';

function aSpotRow(
  overrides: Partial<DaySpotOverview> & { id: string; label: string }
): DaySpotOverview {
  const { id, label, ...rest } = overrides;
  return {
    spot: {
      id,
      label,
      group: 'IT',
      active: true,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    },
    reservation: null,
    waitlistCount: 0,
    viewerWaitlistEntryId: null,
    viewerWaitlistPosition: null,
    ...rest,
  };
}

const FREE = aSpotRow({ id: 's1', label: 'E2.93' });
const TAKEN = aSpotRow({
  id: 's2',
  label: 'E2.92',
  reservation: {
    id: 'r1',
    createdAt: TIMESTAMP,
    user: { id: 'u1', name: 'Karel Zíbar', licensePlate: '4AB 1234' },
  },
});
const QUEUED = aSpotRow({
  id: 's3',
  label: 'E2.94',
  reservation: {
    id: 'r2',
    createdAt: TIMESTAMP,
    user: { id: 'u2', name: 'Petr Novák', licensePlate: '8SC 9012' },
  },
  waitlistCount: 2,
});

function anOverview(overrides: Partial<DayOverviewOutput> = {}): DayOverviewOutput {
  return {
    date: '2026-09-28',
    window: {
      month: '2026-09',
      windowFrom: '2026-08-25',
      windowTo: '2026-08-31',
      state: 'OPEN',
      lockMode: 'AUTO',
    },
    canReserve: true,
    // Required by `overview.day` since Task 31 (`doc/decision/0175-*`). This
    // screen never reads it — it is the admin's day view, not the reserving
    // one — but the fixture must still satisfy the contract type. `true`
    // matches the `state: 'OPEN'` window above.
    canReserveMonth: true,
    spots: [FREE, TAKEN, QUEUED],
    viewerReservationId: null,
    ...overrides,
  };
}

function renderScreen(overrides: Partial<AdminDayScreenProps> = {}) {
  const onRetry = jest.fn();
  const onOpenLot = jest.fn();

  const props: AdminDayScreenProps = {
    date: '2026-09-28',
    day: { kind: 'ready', data: anOverview() },
    onRetry,
    onOpenLot,
    ...overrides,
  };

  render(
    <IntlProvider>
      <AdminDayScreen {...props} />
    </IntlProvider>
  );

  return { onRetry, onOpenLot, user: userEvent.setup() };
}

function rowOf(id: string): HTMLElement {
  const row = document.querySelector(`[data-row-id="${id}"]`);
  if (!(row instanceof HTMLElement)) {
    throw new Error(`no row rendered for ${id}`);
  }
  return row;
}

describe('AdminDayScreen', () => {
  it('heads the day in the design’s long Czech form', () => {
    // doc/design/screens/06-admin-overview.png
    renderScreen();

    expect(screen.getByRole('heading', { name: 'pondělí 28. září 2026' })).toBeInTheDocument();
  });

  it('counts free and taken spots from the rows, not from a separate field', () => {
    renderScreen();

    expect(screen.getByText('1 volných')).toBeInTheDocument();
    expect(screen.getByText('2 obsazených')).toBeInTheDocument();
  });

  it('counts a lot with nothing booked as entirely free', () => {
    renderScreen({ day: { kind: 'ready', data: anOverview({ spots: [FREE] }) } });

    expect(screen.getByText('1 volných')).toBeInTheDocument();
    expect(screen.getByText('0 obsazených')).toBeInTheDocument();
  });

  it('carries the window banner for the day’s own month', () => {
    renderScreen();

    expect(
      screen.getByText('Rezervace na září 2026 jsou otevřené — zapisovat lze do 31. srpna.')
    ).toBeInTheDocument();
  });

  it('names the holder of a taken spot, and says nothing of the kind for a free one', () => {
    renderScreen();

    expect(within(rowOf('s2')).getByText('Obsazeno — Karel Zíbar')).toBeInTheDocument();
    expect(within(rowOf('s1')).getByText('Volné')).toBeInTheDocument();
  });

  it('shows how many people are queued, and says so when nobody is', () => {
    renderScreen();

    expect(within(rowOf('s3')).getByText('2 ve frontě')).toBeInTheDocument();
    expect(within(rowOf('s1')).getByText('Nikdo nečeká')).toBeInTheDocument();
  });

  it('never shows a licence plate — an admin table is not the parking grid', () => {
    renderScreen();

    expect(screen.queryByText('4AB 1234')).not.toBeInTheDocument();
  });

  it('opens the lot screen from its button', async () => {
    const { onOpenLot, user } = renderScreen();

    await user.click(screen.getByRole('button', { name: 'Otevřít parkoviště' }));

    expect(onOpenLot).toHaveBeenCalledTimes(1);
  });

  it('says the lot is empty rather than drawing a table of nothing', () => {
    renderScreen({ day: { kind: 'ready', data: anOverview({ spots: [] }) } });

    expect(screen.getByText('Na parkovišti nejsou žádná aktivní místa')).toBeInTheDocument();
  });

  it('waits while the day is in flight', () => {
    renderScreen({ day: { kind: 'loading' } });

    expect(screen.getByRole('status')).toHaveTextContent('Načítá se…');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('offers a retry when the day could not be loaded', async () => {
    const { onRetry, user } = renderScreen({
      day: { kind: 'error', error: new Error('connection refused') },
    });

    expect(screen.queryByText(/connection refused/u)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zkusit znovu' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
