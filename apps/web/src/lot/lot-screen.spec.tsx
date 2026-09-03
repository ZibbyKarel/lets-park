import type { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryProvider, createApiQueryUtils, createQueryClient } from '@lets-park/query';
import { IntlProvider } from '@lets-park/i18n';
import type { DayOverviewOutput, DaySpotOverview, MyProfile } from '@lets-park/contract';
import { ApiProvider } from '../shell/api-provider';
import { LotScreen } from './lot-screen';

/**
 * The connected half of the screen — Task 24's fix round, Important-1.
 *
 * `lot-view.ts`, `day-overview-cache.ts`, `use-cell-locks.ts` and
 * `use-lot-realtime.ts` all have their own suites and are exercised for real
 * here, unmocked. What this file adds is what only exists in `lot-screen.tsx`
 * itself and nowhere else: the session gate on the day query, `showBulk`
 * reading `canReserve` rather than re-deriving it, the four mutations all
 * closing the dialog and invalidating the day the same way, the lookup that
 * turns an open spot back into a reservation id, `withMonth`/`withYear`'s date
 * arithmetic, and the loading/error/empty branches.
 *
 * Doubled at the wrapper boundary, same as `use-lot-realtime.spec.tsx`:
 * `@lets-park/api-client` (so `ApiProvider` needs no live transport) and
 * `@lets-park/auth/client` / `@lets-park/realtime-client` (so no session and
 * no socket are required). `@lets-park/query` is real, for the same reason it
 * is real there — a stubbed client would let a wrong query key pass unnoticed.
 * `@lets-park/i18n` is real except for `todayInPrague`, pinned so the initial
 * day is deterministic without touching the system clock.
 */

const FIXED_TODAY = '2026-01-31';

jest.mock('@lets-park/i18n', () => {
  const actual = jest.requireActual('@lets-park/i18n');
  return { ...actual, todayInPrague: () => '2026-01-31' };
});

let sessionStatusValue: 'authenticated' | 'unauthenticated' | 'loading' = 'authenticated';
function currentSessionStatus() {
  return sessionStatusValue;
}

jest.mock('@lets-park/auth/client', () => ({
  useAccessTokenProvider: () => async () => 'irrelevant',
  useSession: () => ({ status: currentSessionStatus() }),
}));

const useCellLockMock = jest.fn();
function callUseCellLockMock(options: unknown) {
  return useCellLockMock(options);
}

jest.mock('@lets-park/realtime-client', () => ({
  // Room-joining and raw events are `use-lot-realtime.spec.tsx` and
  // `use-cell-locks.spec.tsx`'s to cover; this suite only needs the calls to
  // exist and do nothing, so `jest.fn()` stands in rather than an
  // `@typescript-eslint/no-empty-function`-tripping empty arrow.
  useDayRoom: jest.fn(),
  useRealtime: () => ({ status: 'connected', reconnect: jest.fn() }),
  useRealtimeEvent: jest.fn(),
  useCellLock: (options: unknown) => callUseCellLockMock(options),
}));

/**
 * One stable set of jest.fn()s, referenced by both the mocked
 * `@lets-park/api-client` and this file's own key derivation — unlike
 * `use-lot-realtime.spec.tsx`'s per-call `mockApiClient()`, this suite asserts
 * *call counts and arguments*, so the functions the screen calls and the ones
 * a test inspects must be the same objects.
 */
const apiMocks = {
  overviewDay: jest.fn(),
  reservationCreate: jest.fn(),
  reservationCancel: jest.fn(),
  waitlistJoin: jest.fn(),
  waitlistLeave: jest.fn(),
  meGet: jest.fn(),
  spotList: jest.fn(),
  previewBulk: jest.fn(),
  confirmBulk: jest.fn(),
};

function buildClient() {
  return {
    overview: { day: apiMocks.overviewDay },
    reservation: {
      create: apiMocks.reservationCreate,
      cancel: apiMocks.reservationCancel,
      previewBulk: apiMocks.previewBulk,
      confirmBulk: apiMocks.confirmBulk,
    },
    waitlist: { join: apiMocks.waitlistJoin, leave: apiMocks.waitlistLeave },
    me: { get: apiMocks.meGet },
    spot: { list: apiMocks.spotList },
  };
}

jest.mock('@lets-park/api-client', () => ({
  ...jest.requireActual('@lets-park/api-client'),
  createApiClient: () => buildClient(),
}));

const DATE = FIXED_TODAY;
const VIEWER = 'user-viewer';
const OTHER_USER = 'user-other';
const T0 = '2026-01-01T00:00:00.000Z';

function dayKey(date: string) {
  return createApiQueryUtils(buildClient() as never).overview.day.queryOptions({
    input: { date },
  }).queryKey;
}

function meKey() {
  return createApiQueryUtils(buildClient() as never).me.get.queryOptions().queryKey;
}

function profile(overrides: Partial<MyProfile> = {}): MyProfile {
  return {
    id: VIEWER,
    email: 'karel.zibar@firma.cz',
    name: 'Karel Zíbar',
    licensePlate: '4AB 1234',
    role: 'USER',
    oktaId: 'okta-1',
    active: true,
    icsToken: 'ics-token',
    preferredParkingSpotId: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

function freeSpot(overrides: Partial<DaySpotOverview> = {}): DaySpotOverview {
  return {
    spot: {
      id: 'spot-free',
      label: 'E2.93',
      group: 'IT',
      active: true,
      createdAt: T0,
      updatedAt: T0,
    },
    reservation: null,
    waitlistCount: 0,
    viewerWaitlistEntryId: null,
    viewerWaitlistPosition: null,
    ...overrides,
  };
}

function takenSpot(overrides: Partial<DaySpotOverview> = {}): DaySpotOverview {
  return {
    spot: {
      id: 'spot-taken',
      label: 'E2.92',
      group: 'IT',
      active: true,
      createdAt: T0,
      updatedAt: T0,
    },
    reservation: {
      id: 'res-other',
      createdAt: T0,
      user: { id: OTHER_USER, name: 'Petr Novák', licensePlate: '8SC 9012' },
    },
    waitlistCount: 0,
    viewerWaitlistEntryId: null,
    viewerWaitlistPosition: null,
    ...overrides,
  };
}

function mineSpot(overrides: Partial<DaySpotOverview> = {}): DaySpotOverview {
  return {
    spot: {
      id: 'spot-mine',
      label: 'E2.94',
      group: 'IT',
      active: true,
      createdAt: T0,
      updatedAt: T0,
    },
    reservation: {
      id: 'res-mine',
      createdAt: T0,
      user: { id: VIEWER, name: 'Karel Zíbar', licensePlate: '4AB 1234' },
    },
    waitlistCount: 0,
    viewerWaitlistEntryId: null,
    viewerWaitlistPosition: null,
    ...overrides,
  };
}

function dayOverview(overrides: Partial<DayOverviewOutput> = {}): DayOverviewOutput {
  return {
    date: DATE,
    window: {
      month: '2026-01',
      windowFrom: '2025-12-25',
      windowTo: '2025-12-31',
      state: 'OPEN',
      lockMode: 'AUTO',
    },
    canReserve: true,
    canReserveMonth: true,
    spots: [freeSpot(), takenSpot(), mineSpot()],
    viewerReservationId: 'res-mine',
    ...overrides,
  };
}

function setup(
  options: {
    sessionStatus?: 'authenticated' | 'unauthenticated' | 'loading';
    profile?: MyProfile;
    day?: DayOverviewOutput | null;
    seedDay?: boolean;
    dayImpl?: () => Promise<DayOverviewOutput>;
  } = {}
) {
  Object.values(apiMocks).forEach((fn) => {
    fn.mockReset();
  });
  useCellLockMock.mockReset();
  apiMocks.reservationCreate.mockResolvedValue(undefined);
  apiMocks.reservationCancel.mockResolvedValue(undefined);
  apiMocks.waitlistJoin.mockResolvedValue(undefined);
  apiMocks.waitlistLeave.mockResolvedValue(undefined);
  // The bulk modal reads the spot list for its preferred-spot label. Its own
  // behaviour is `bulk-modal.spec.tsx`'s; here it only has to not fail.
  apiMocks.spotList.mockResolvedValue({ spots: [] });

  sessionStatusValue = options.sessionStatus ?? 'authenticated';

  const client = createQueryClient({ defaultOptions: { queries: { retry: false } } });
  const person = options.profile ?? profile();
  client.setQueryData(meKey(), person);
  apiMocks.meGet.mockResolvedValue(person);

  const shouldSeed = options.seedDay ?? options.day !== null;
  const day = options.day === undefined ? dayOverview() : options.day;

  if (options.dayImpl) {
    apiMocks.overviewDay.mockImplementation(options.dayImpl);
  } else if (shouldSeed && day !== null) {
    apiMocks.overviewDay.mockResolvedValue(day);
  } else {
    // Never resolves — the loading/gate tests need `isPending` to stay true
    // rather than flip to `isError` on an unmocked `undefined` return. An
    // expression-bodied arrow (rather than `() => {}`) so the executor that
    // deliberately does nothing with `resolve`/`reject` isn't an empty block
    // `@typescript-eslint/no-empty-function` would flag.
    apiMocks.overviewDay.mockReturnValue(new Promise(() => undefined));
  }

  if (shouldSeed && day !== null) {
    client.setQueryData(dayKey(DATE), day);
  }

  const invalidate = jest.spyOn(client, 'invalidateQueries');

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryProvider client={client}>
        <ApiProvider url="http://localhost:3000/api">
          <IntlProvider>{children}</IntlProvider>
        </ApiProvider>
      </QueryProvider>
    );
  }

  const utils = render(<LotScreen />, { wrapper: Wrapper });

  return { ...utils, client, invalidate, user: userEvent.setup() };
}

describe('LotScreen — the session gate on the day query', () => {
  it('does not fetch the day before the session exists', () => {
    setup({ sessionStatus: 'unauthenticated', seedDay: false });

    expect(apiMocks.overviewDay).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Načítá se…');
  });

  it('fires the day query once the session exists, without a remount', async () => {
    const { rerender } = setup({ sessionStatus: 'unauthenticated', seedDay: false });
    expect(apiMocks.overviewDay).not.toHaveBeenCalled();

    sessionStatusValue = 'authenticated';
    rerender(<LotScreen />);

    await waitFor(() => expect(apiMocks.overviewDay).toHaveBeenCalledTimes(1));
  });
});

describe('LotScreen — loading, error and empty', () => {
  it('shows the loading state while the day has not arrived', () => {
    setup({ seedDay: false });
    expect(screen.getByRole('status')).toHaveTextContent('Načítá se…');
  });

  it('shows a retry-capable error, and retry goes through the same query', async () => {
    const { user } = setup({ seedDay: false, dayImpl: () => Promise.reject(new Error('boom')) });

    await screen.findByRole('button', { name: 'Zkusit znovu' });
    expect(screen.getByText('Zkuste to prosím znovu za chvíli.')).toBeInTheDocument();

    apiMocks.overviewDay.mockImplementation(() => Promise.resolve(dayOverview()));
    await user.click(screen.getByRole('button', { name: 'Zkusit znovu' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Rezervovat místo E2.93' })).toBeInTheDocument()
    );
  });

  it('shows the empty state when the lot has no active spots', () => {
    setup({ day: dayOverview({ spots: [] }) });
    expect(screen.getByText('Na parkovišti nejsou žádná aktivní místa.')).toBeInTheDocument();
  });
});

describe('LotScreen — the bulk modal', () => {
  it('opens on the header button, anchored to the day on screen', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Hromadná rezervace' }));

    expect(await screen.findByRole('dialog', { name: 'Hromadná rezervace' })).toBeInTheDocument();
    // The month of `FIXED_TODAY` (2026-01-31), in the locative — proof the
    // grid is anchored to the screen's day rather than to "now".
    expect(screen.getByText(/Vyberte dny v lednu\./)).toBeInTheDocument();
  });

  it('hands the modal the backend’s own canReserveMonth, so a window closing under it is refused', async () => {
    // Hiding the header button covers "do not invite this"; it cannot cover a
    // window that closes while the modal is already open, and this is the
    // wiring that does (`doc/decision/0173-*`). A modal handed a hard-coded
    // `true` would keep offering the flow here.
    const { user, client } = setup();

    await user.click(screen.getByRole('button', { name: 'Hromadná rezervace' }));
    expect(await screen.findByRole('dialog', { name: 'Hromadná rezervace' })).toBeInTheDocument();

    act(() => {
      client.setQueryData(dayKey(DATE), dayOverview({ canReserveMonth: false }));
    });

    expect(
      await screen.findByRole('dialog', { name: 'Rezervace jsou uzamčené' })
    ).toBeInTheDocument();
  });

  it('offers bulk reservation on a day that is itself unbookable, when the month is open', async () => {
    // `canReserve` is per-day: a weekend, a Czech holiday and any past day all
    // make it false while leaving the month wide open. Reading it here switched
    // the feature off on roughly a third of the calendar — including 28
    // September 2026, the holiday the design's own screenshot shows the modal
    // open on (`doc/decision/0175-*`).
    const { user } = setup({
      day: dayOverview({ canReserve: false, canReserveMonth: true }),
    });

    await user.click(screen.getByRole('button', { name: 'Hromadná rezervace' }));

    expect(await screen.findByRole('dialog', { name: 'Hromadná rezervace' })).toBeInTheDocument();
  });

  it('closes again when the day changes', async () => {
    // The selection belongs to one month; carrying it across a day change
    // would be a batch the contract refuses.
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Hromadná rezervace' }));
    expect(await screen.findByRole('dialog', { name: 'Hromadná rezervace' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Následující den' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Hromadná rezervace' })).not.toBeInTheDocument()
    );
  });
});

describe('LotScreen — showBulk reads canReserveMonth, not the window state and not canReserve', () => {
  it('shows the button when canReserveMonth is true', () => {
    setup({ day: dayOverview({ canReserveMonth: true }) });
    expect(screen.getByRole('button', { name: 'Hromadná rezervace' })).toBeInTheDocument();
  });

  it('hides the button when canReserveMonth is false, even though the window is OPEN', () => {
    // The exact re-derivation the review names as a live hazard: reading
    // `window.state === 'OPEN'` instead of the backend's answer would get this
    // wrong, because an admin is not bound by the window at all.
    setup({
      day: dayOverview({
        canReserve: false,
        canReserveMonth: false,
        window: {
          month: '2026-01',
          windowFrom: '2025-12-25',
          windowTo: '2025-12-31',
          state: 'OPEN',
          lockMode: 'AUTO',
        },
      }),
    });
    expect(screen.queryByRole('button', { name: 'Hromadná rezervace' })).not.toBeInTheDocument();
  });

  it('keeps the button on a weekend or holiday of an open month, where canReserve is false', () => {
    setup({ day: dayOverview({ canReserve: false, canReserveMonth: true }) });
    expect(screen.getByRole('button', { name: 'Hromadná rezervace' })).toBeInTheDocument();
  });
});

describe('LotScreen — every write closes the dialog and invalidates the day', () => {
  it('reserving a free spot', async () => {
    const { user, invalidate } = setup();

    await user.click(screen.getByRole('button', { name: 'Rezervovat místo E2.93' }));
    await user.click(await screen.findByRole('button', { name: 'Rezervovat' }));

    await waitFor(() =>
      expect(apiMocks.reservationCreate.mock.calls[0]?.[0]).toEqual({
        parkingSpotId: 'spot-free',
        date: DATE,
      })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: dayKey(DATE) }));
  });

  it('joining the waitlist on a spot somebody else holds', async () => {
    const { user, invalidate } = setup();

    await user.click(screen.getByRole('button', { name: 'Otevřít místo E2.92' }));
    await user.click(await screen.findByRole('button', { name: 'Přidat se do fronty' }));

    await waitFor(() =>
      expect(apiMocks.waitlistJoin.mock.calls[0]?.[0]).toEqual({
        parkingSpotId: 'spot-taken',
        date: DATE,
      })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: dayKey(DATE) }));
  });

  it('leaving a queue the caller is already in', async () => {
    const { user, invalidate } = setup({
      day: dayOverview({
        spots: [
          freeSpot(),
          takenSpot({ viewerWaitlistEntryId: 'entry-1', viewerWaitlistPosition: 2 }),
          mineSpot(),
        ],
      }),
    });

    await user.click(screen.getByRole('button', { name: 'Otevřít místo E2.92' }));
    await user.click(await screen.findByRole('button', { name: 'Odejít z fronty' }));

    await waitFor(() =>
      expect(apiMocks.waitlistLeave.mock.calls[0]?.[0]).toEqual({ waitlistEntryId: 'entry-1' })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: dayKey(DATE) }));
  });

  it('does not close the dialog, or invalidate, when a write fails', async () => {
    const { user, invalidate } = setup();
    // After `setup()`, which is what resets and re-arms every mock — setting
    // this up first would just be discarded by `setup()`'s own reset.
    apiMocks.reservationCreate.mockRejectedValue(new Error('boom'));

    await user.click(screen.getByRole('button', { name: 'Rezervovat místo E2.93' }));
    await user.click(await screen.findByRole('button', { name: 'Rezervovat' }));

    await waitFor(() => expect(apiMocks.reservationCreate).toHaveBeenCalled());
    // onError, not onSettled: the dialog stays open so the caller can see why.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('LotScreen — onCancelReservation looks the id up off day.spots', () => {
  it('cancels the reservation on the spot whose dialog is open — an admin, on someone else’s', async () => {
    const { user } = setup({ profile: profile({ role: 'ADMIN' }) });

    await user.click(screen.getByRole('button', { name: 'Otevřít místo E2.92' }));
    await user.click(await screen.findByRole('button', { name: 'Zrušit rezervaci' }));

    await waitFor(() =>
      expect(apiMocks.reservationCancel.mock.calls[0]?.[0]).toEqual({ reservationId: 'res-other' })
    );
  });

  it('cancels the reservation on the spot whose dialog is open — a caller, on their own', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Otevřít místo E2.94' }));
    await user.click(await screen.findByRole('button', { name: 'Zrušit rezervaci' }));

    await waitFor(() =>
      expect(apiMocks.reservationCancel.mock.calls[0]?.[0]).toEqual({ reservationId: 'res-mine' })
    );
  });
});

describe('LotScreen — withMonth and withYear', () => {
  it('clamps the day when a month change lands on a shorter month', async () => {
    // FIXED_TODAY is 2026-01-31; February 2026 has 28 days.
    const { user } = setup();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Měsíc' }), '2');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('28. února 2026');
  });

  it('moves the year while keeping the day and month, when it fits', async () => {
    const { user } = setup();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Rok' }), '2027');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('31. ledna 2027');
  });
});

describe('LotScreen — the cell lock is not held for a dialog that cannot write', () => {
  function lastCellLockEnabled() {
    const call = useCellLockMock.mock.calls.at(-1)?.[0] as { enabled: boolean } | undefined;
    return call?.enabled;
  }

  it('takes the hold when opening a free spot to reserve it', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Rezervovat místo E2.93' }));

    expect(lastCellLockEnabled()).toBe(true);
  });

  it('does not take the hold for the read-only explanation on a window-locked spot', async () => {
    const { user } = setup({ day: dayOverview({ canReserve: false }) });

    await user.click(screen.getByRole('button', { name: 'Otevřít místo E2.93' }));

    expect(lastCellLockEnabled()).toBe(false);
  });
});
