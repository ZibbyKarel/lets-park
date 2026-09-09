import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createApiQueryUtils, createQueryClient } from '@lets-park/query';
import { formatFullDate } from '@lets-park/i18n';
import type { AdminUser, DayOverviewOutput, DaySpotOverview, MyProfile } from '@lets-park/contract';
import { profile, T0 } from '../../testing/fixtures';
import { createProviderWrapper } from '../../testing/providers';
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
  // A stable function reference, not `() => async () => 'irrelevant'` — that
  // form hands `ApiProvider` a *new* function every render, which keeps its
  // `useMemo([url, getAccessToken])` from ever settling and defeats any
  // assertion that depends on `api`'s identity staying put across a rerender
  // (`doc/decision/0141-*`). Same fix as `api-provider.spec.tsx`.
  useAccessTokenProvider: () => mockGetAccessToken,
  useSession: () => ({ status: currentSessionStatus() }),
}));

const mockGetAccessToken = async () => 'irrelevant';

const useCellLockMock = jest.fn();
function callUseCellLockMock(options: unknown) {
  return useCellLockMock(options);
}

/**
 * The connection status the screen sees, and the `reconnect` it is handed.
 * Module-level rather than a prop for the same reason as in
 * `use-lot-realtime.spec.tsx`: the real `useRealtime()` reads a context the
 * provider owns, so a status change is something that happens *to* this
 * screen.
 */
type MockRealtimeStatus = 'connecting' | 'connected' | 'disconnected' | 'rejected';
let realtimeStatusValue: MockRealtimeStatus = 'connected';
const reconnectMock = jest.fn();
function currentRealtime() {
  return { status: realtimeStatusValue, reconnect: reconnectMock };
}

jest.mock('@lets-park/realtime-client', () => ({
  // Room-joining and raw events are `use-lot-realtime.spec.tsx` and
  // `use-cell-locks.spec.tsx`'s to cover; this suite only needs the calls to
  // exist and do nothing, so `jest.fn()` stands in rather than an
  // `@typescript-eslint/no-empty-function`-tripping empty arrow.
  useDayRoom: jest.fn(),
  useRealtime: () => currentRealtime(),
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
  adminUserList: jest.fn(),
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
    admin: { user: { list: apiMocks.adminUserList } },
  };
}

jest.mock('@lets-park/api-client', () => ({
  ...jest.requireActual('@lets-park/api-client'),
  createApiClient: () => buildClient(),
}));

const DATE = FIXED_TODAY;
const VIEWER = 'user-viewer';
const OTHER_USER = 'user-other';

function dayKey(date: string) {
  return createApiQueryUtils(buildClient() as never).overview.day.queryOptions({
    input: { date },
  }).queryKey;
}

function meKey() {
  return createApiQueryUtils(buildClient() as never).me.get.queryOptions().queryKey;
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
      holder: { kind: 'USER', userId: OTHER_USER, name: 'Petr Novák', licensePlate: '8SC 9012' },
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
      holder: { kind: 'USER', userId: VIEWER, name: 'Karel Zíbar', licensePlate: '4AB 1234' },
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
    realtimeStatus?: MockRealtimeStatus;
    /** Only fetched by an admin; overrides the empty-list default. */
    adminUsers?: readonly AdminUser[];
  } = {}
) {
  Object.values(apiMocks).forEach((fn) => {
    fn.mockReset();
  });
  useCellLockMock.mockReset();
  reconnectMock.mockReset();
  // `connected` is the resting state; a screen that has never connected is a
  // separate case, exercised by its own test below.
  realtimeStatusValue = options.realtimeStatus ?? 'connected';
  apiMocks.reservationCreate.mockResolvedValue(undefined);
  apiMocks.reservationCancel.mockResolvedValue(undefined);
  apiMocks.waitlistJoin.mockResolvedValue(undefined);
  apiMocks.waitlistLeave.mockResolvedValue(undefined);
  // The bulk modal reads the spot list for its preferred-spot label. Its own
  // behaviour is `bulk-modal.spec.tsx`'s; here it only has to not fail.
  apiMocks.spotList.mockResolvedValue({ spots: [] });
  // Only fetched by an admin (`holderQuery`'s `enabled`), but harmless to seed
  // unconditionally — a case that cares about its contents passes `adminUsers`.
  apiMocks.adminUserList.mockResolvedValue({ users: options.adminUsers ?? [] });

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

  const Wrapper = createProviderWrapper(client);

  const utils = render(<LotScreen />, { wrapper: Wrapper });

  return { ...utils, client, invalidate, user: userEvent.setup() };
}

describe('LotScreen — the session gate on the day query', () => {
  /**
   * This used to also assert `screen.getByRole('status')` reads "Načítá se…"
   * for an `unauthenticated` session — i.e. it pinned the spinner as the
   * **resting** state for a session that had ended, which is the dead end the
   * final review caught: no redirect, no `signIn()`, no message, forever.
   *
   * The gate itself is right and stays: firing before the session exists
   * spends a request the API answers 401, and a 401 is not retried. What is
   * wrong is treating the spinner as an outcome. Nothing on this screen
   * recovers a lost session and nothing on it should — `AppTopBar`, which the
   * `(app)` layout renders above every signed-in route, calls `useRequireAuth`
   * and navigates away. That is asserted in `app/(app)/layout.spec.tsx`, where
   * the guard actually lives; asserting the spinner here as well would pin the
   * old behaviour back in from a second file.
   */
  it('does not fetch the day before the session exists', () => {
    setup({ sessionStatus: 'unauthenticated', seedDay: false });

    expect(apiMocks.overviewDay).not.toHaveBeenCalled();
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
      expect(screen.getByRole('button', { name: /^Rezervovat místo E2\.93,/u })).toBeInTheDocument()
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

    await user.click(screen.getByRole('button', { name: /^Rezervovat místo E2\.93,/u }));
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

    await user.click(screen.getByRole('button', { name: /^Otevřít místo E2\.92,/u }));
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

    await user.click(screen.getByRole('button', { name: /^Otevřít místo E2\.92,/u }));
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

    await user.click(screen.getByRole('button', { name: /^Rezervovat místo E2\.93,/u }));
    await user.click(await screen.findByRole('button', { name: 'Rezervovat' }));

    await waitFor(() => expect(apiMocks.reservationCreate).toHaveBeenCalled());
    // onError, not onSettled: the dialog stays open so the caller can see why.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('invalidates the day now on screen, not the one it left, after a day change', async () => {
    const NEXT_DATE = '2026-02-01';
    const { user, invalidate } = setup();
    // `overview.day` has to answer for whichever date is actually on screen
    // once the day changes, or the screen would be stuck loading — set
    // directly on the mock (rather than through `setup()`'s single-date
    // `dayImpl`, typed as a zero-argument function) so it can follow the
    // input it was actually called with.
    apiMocks.overviewDay.mockImplementation((input: { date: string }) =>
      Promise.resolve(dayOverview({ date: input.date, spots: [freeSpot()] }))
    );

    await user.click(screen.getByRole('button', { name: 'Následující den' }));
    await user.click(await screen.findByRole('button', { name: /^Rezervovat místo E2\.93,/u }));
    await user.click(await screen.findByRole('button', { name: 'Rezervovat' }));

    await waitFor(() =>
      expect(apiMocks.reservationCreate.mock.calls[0]?.[0]).toEqual({
        parkingSpotId: 'spot-free',
        date: NEXT_DATE,
      })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // The write happened on the day now on screen — the invalidation has to
    // target that key, not the one `invalidateDay` was first created with.
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: dayKey(NEXT_DATE) })
    );
    expect(invalidate).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: dayKey(DATE) })
    );
  });
});

describe('LotScreen — onCancelReservation looks the id up off day.spots', () => {
  it('cancels the reservation on the spot whose dialog is open — an admin, on someone else’s', async () => {
    const { user } = setup({ profile: profile({ role: 'ADMIN' }) });

    await user.click(screen.getByRole('button', { name: /^Otevřít místo E2\.92,/u }));
    await user.click(await screen.findByRole('button', { name: 'Zrušit rezervaci' }));

    await waitFor(() =>
      expect(apiMocks.reservationCancel.mock.calls[0]?.[0]).toEqual({ reservationId: 'res-other' })
    );
  });

  it('cancels the reservation on the spot whose dialog is open — a caller, on their own', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: /^Otevřít místo E2\.94,/u }));
    await user.click(await screen.findByRole('button', { name: 'Zrušit rezervaci' }));

    await waitFor(() =>
      expect(apiMocks.reservationCancel.mock.calls[0]?.[0]).toEqual({ reservationId: 'res-mine' })
    );
  });
});

describe('LotScreen — the header date picker', () => {
  it('browses to another month without moving the day, until one is picked', async () => {
    // FIXED_TODAY is 2026-01-31; February 2026 has 28 days, so day 31 cannot
    // be clicked there — proof that browsing the grid does not commit a date
    // on its own.
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: formatFullDate(DATE) }));
    const dialog = screen.getByRole('dialog', { name: 'Vybrat datum' });
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Měsíc' }), '2');
    await user.click(within(dialog).getByRole('button', { name: formatFullDate('2026-02-28') }));

    expect(screen.queryByRole('dialog', { name: 'Vybrat datum' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: formatFullDate('2026-02-28') })).toBeInTheDocument();
  });

  it('browses to another year, then commits whichever day is picked', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: formatFullDate(DATE) }));
    const dialog = screen.getByRole('dialog', { name: 'Vybrat datum' });
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Rok' }), '2027');
    await user.click(within(dialog).getByRole('button', { name: formatFullDate('2027-01-31') }));

    expect(screen.getByRole('button', { name: formatFullDate('2027-01-31') })).toBeInTheDocument();
  });
});

describe('LotScreen — the cell lock is not held for a dialog that cannot write', () => {
  function lastCellLockEnabled() {
    const call = useCellLockMock.mock.calls.at(-1)?.[0] as { enabled: boolean } | undefined;
    return call?.enabled;
  }

  it('takes the hold when opening a free spot to reserve it', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: /^Rezervovat místo E2\.93,/u }));

    expect(lastCellLockEnabled()).toBe(true);
  });

  it('does not take the hold for the read-only explanation on a window-locked spot', async () => {
    const { user } = setup({ day: dayOverview({ canReserve: false }) });

    await user.click(screen.getByRole('button', { name: /^Otevřít místo E2\.93,/u }));

    expect(lastCellLockEnabled()).toBe(false);
  });
});

/**
 * What the user is told about the connection.
 *
 * The screen used to draw a notice for exactly one of the four statuses —
 * `rejected` — so the far more common way to end up looking at a frozen board
 * (`disconnected`, and `connecting` while the transport retries) was invisible.
 * The rule itself is `toRealtimeNoticeView` and is unit-tested in
 * `lot-view.spec.ts`; what these assert is that the screen actually *draws* it,
 * and which affordance comes with which state.
 *
 * The notice is found by its Czech sentence rather than by `role="status"`:
 * `WindowBanner` is also a `status` and is always present, so a role query
 * would match the wrong node — the exact way this could pass while showing
 * nothing.
 */
describe('LotScreen — telling the user the board has stopped updating', () => {
  const NOTICE = 'Živé aktualizace jsou odpojené — přehled se nemusí sám obnovovat.';
  const RECONNECT = 'Připojit znovu';

  it('says nothing while the board is live', () => {
    setup();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('names a dropped connection, without a button that would do nothing', () => {
    const { rerender } = setup();

    realtimeStatusValue = 'disconnected';
    rerender(<LotScreen />);

    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: RECONNECT })).not.toBeInTheDocument();
  });

  it('keeps saying so while the transport is retrying', () => {
    const { rerender } = setup();

    realtimeStatusValue = 'connecting';
    rerender(<LotScreen />);

    expect(screen.getByText(NOTICE)).toBeInTheDocument();
  });

  it('clears the notice when the connection comes back', () => {
    const { rerender } = setup();

    realtimeStatusValue = 'disconnected';
    rerender(<LotScreen />);
    expect(screen.getByText(NOTICE)).toBeInTheDocument();

    realtimeStatusValue = 'connected';
    rerender(<LotScreen />);
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('does not flash the notice on a page load that has not connected yet', () => {
    // `RealtimeProvider` starts at `disconnected`. A rule reading the status
    // alone would warn on every load, about data that has not gone stale
    // because it has not arrived.
    setup({ realtimeStatus: 'disconnected' });
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('offers the reconnect button for a refused handshake, and wires it to the connection', async () => {
    const { user } = setup({ realtimeStatus: 'rejected' });

    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: RECONNECT }));

    expect(reconnectMock).toHaveBeenCalledTimes(1);
  });

  it('reports a refused handshake even before the board was ever live', () => {
    // Terminal by construction (`doc/decision/0061-*`): no later state
    // corrects it, so the "has it ever connected" guard must not swallow it.
    setup({ realtimeStatus: 'rejected' });
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: RECONNECT })).toBeInTheDocument();
  });
});

describe('LotScreen — an admin naming a holder', () => {
  it('reserves a free bay for another user, and asks only for active ones', async () => {
    const other: AdminUser = {
      id: OTHER_USER,
      email: 'jana@firma.cz',
      name: 'Jana Nováková',
      licensePlate: null,
      role: 'USER',
      oktaId: 'okta-2',
      active: true,
      preferredParkingSpotId: null,
      createdAt: T0,
      updatedAt: T0,
    };
    const admin: AdminUser = {
      id: VIEWER,
      email: 'karel.zibar@firma.cz',
      name: 'Karel Zíbar',
      licensePlate: '4AB 1234',
      role: 'ADMIN',
      oktaId: 'okta-1',
      active: true,
      preferredParkingSpotId: null,
      createdAt: T0,
      updatedAt: T0,
    };

    const { user } = setup({
      profile: profile({ role: 'ADMIN' }),
      day: dayOverview({ spots: [freeSpot()] }),
      adminUsers: [admin, other],
    });

    await user.click(await screen.findByRole('button', { name: /E2\.93/ }));
    await user.selectOptions(await screen.findByLabelText('Rezervovat pro'), OTHER_USER);
    await user.click(screen.getByRole('button', { name: 'Rezervovat' }));

    await waitFor(() =>
      expect(apiMocks.reservationCreate.mock.calls[0]?.[0]).toEqual({
        parkingSpotId: 'spot-free',
        date: DATE,
        holder: { kind: 'USER', userId: OTHER_USER, licensePlate: null },
      })
    );
    // `active: true`, not a client-side filter: `adminListUsersInputSchema`
    // carries the flag (`libs/contract/src/api/users.ts:64-66`).
    expect(apiMocks.adminUserList.mock.calls[0]?.[0]).toEqual({ active: true });
  });
});
