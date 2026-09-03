import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryProvider, createApiQueryUtils, createQueryClient } from '@lets-park/query';
import { IntlProvider } from '@lets-park/i18n';
import type {
  ConfirmBulkOutput,
  MyProfile,
  ParkingSpot,
  PreviewBulkOutput,
} from '@lets-park/contract';
import { ApiProvider } from '../shell/api-provider';
import { BulkReservationModal } from './bulk-modal';

/**
 * The bulk modal, wired.
 *
 * `./bulk-view.spec.ts` already covers every decision the flow makes with no
 * DOM at all — the grid's arithmetic, the selectability rule, the
 * preferred-spot label's four cases, the proposal/result comparison and the
 * error-code mapping. What this file adds is only what lives in the component:
 * the three steps and the order they run in, the copy each outcome renders,
 * the cache invalidation, and the two halves of the locked-month block.
 *
 * Doubled at the wrapper boundary the same way `lot-screen.spec.tsx` does:
 * `@lets-park/api-client`'s transport and `@lets-park/auth/client`'s session.
 * `@lets-park/query` and `@lets-park/i18n` are real, so a wrong query key or a
 * missing message would fail rather than pass silently; only `todayInPrague`
 * is pinned, so the grid does not depend on the wall clock.
 */

/**
 * Mid-September, with "today" pinned to the 1st: the whole month is in the
 * future, so nothing is blocked for being in the past and every weekday cell
 * is selectable. The literal is repeated inside the `jest.mock` factory
 * because a factory is hoisted above every `const` in the file.
 */
const ANCHOR = '2026-09-15';

jest.mock('@lets-park/i18n', () => {
  const actual = jest.requireActual('@lets-park/i18n');
  return { ...actual, todayInPrague: () => '2026-09-01' };
});

jest.mock('@lets-park/auth/client', () => ({
  useAccessTokenProvider: () => async () => 'irrelevant',
  useSession: () => ({ status: 'authenticated' }),
}));

const apiMocks = {
  meGet: jest.fn(),
  spotList: jest.fn(),
  previewBulk: jest.fn(),
  confirmBulk: jest.fn(),
  overviewDay: jest.fn(),
};

function buildClient() {
  return {
    me: { get: apiMocks.meGet },
    spot: { list: apiMocks.spotList },
    reservation: { previewBulk: apiMocks.previewBulk, confirmBulk: apiMocks.confirmBulk },
    overview: { day: apiMocks.overviewDay },
  };
}

jest.mock('@lets-park/api-client', () => ({
  ...jest.requireActual('@lets-park/api-client'),
  createApiClient: () => buildClient(),
}));

/**
 * The unmocked transport, used only to *manufacture* a rejection.
 *
 * Same reasoning as `screen-state.spec.tsx`: a failure the component has to
 * read must come off a real `RPCLink`, because a hand-built error would assert
 * this file's idea of the wire shape instead of the transport's.
 */
const realApiClient =
  jest.requireActual<typeof import('@lets-park/api-client')>('@lets-park/api-client');

async function contractFailure(code: string, status: number): Promise<unknown> {
  const client = realApiClient.createApiClient({
    url: 'https://api.test/rpc',
    fetch: async () =>
      new Response(
        JSON.stringify({
          json: { defined: false, code, status, message: 'developer-facing' },
          meta: [],
        }),
        { status, headers: { 'content-type': 'application/json' } }
      ),
  });
  const marker = Symbol('resolved');
  const outcome = await client.reservation.confirmBulk({ dates: [ANCHOR] }).then(
    () => marker,
    (error: unknown) => error
  );
  if (outcome === marker) {
    throw new Error('expected the call to reject, but it resolved');
  }
  return outcome;
}

const T0 = '2026-01-01T00:00:00.000Z';
const PREFERRED_SPOT_ID = 'spot-preferred';

function spot(id: string, label: string): ParkingSpot {
  return { id, label, group: 'IT', active: true, createdAt: T0, updatedAt: T0 };
}

function profile(overrides: Partial<MyProfile> = {}): MyProfile {
  return {
    id: 'user-viewer',
    email: 'karel.zibar@firma.cz',
    name: 'Karel Zíbar',
    licensePlate: '4AB 1234',
    role: 'USER',
    oktaId: 'okta-1',
    active: true,
    icsToken: 'ics-token',
    preferredParkingSpotId: PREFERRED_SPOT_ID,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

function preview(overrides: Partial<PreviewBulkOutput> = {}): PreviewBulkOutput {
  return {
    month: '2026-09',
    preferredParkingSpotId: PREFERRED_SPOT_ID,
    days: [
      {
        outcome: 'SPOT_ASSIGNED',
        date: '2026-09-01',
        parkingSpotId: PREFERRED_SPOT_ID,
        parkingSpotLabel: 'E2.92',
        isPreferredSpot: true,
      },
      {
        outcome: 'SPOT_ASSIGNED',
        date: '2026-09-02',
        parkingSpotId: 'spot-other',
        parkingSpotLabel: 'E2.93',
        isPreferredSpot: false,
      },
    ],
    summary: { assigned: 2, queued: 0, unavailable: 0, preferredSpotHits: 1 },
    ...overrides,
  };
}

function confirmed(overrides: Partial<ConfirmBulkOutput> = {}): ConfirmBulkOutput {
  return {
    month: '2026-09',
    preferredParkingSpotId: PREFERRED_SPOT_ID,
    days: [
      {
        outcome: 'SPOT_ASSIGNED',
        date: '2026-09-01',
        parkingSpotId: PREFERRED_SPOT_ID,
        parkingSpotLabel: 'E2.92',
        isPreferredSpot: true,
        reservationId: 'res-1',
      },
      {
        outcome: 'SPOT_ASSIGNED',
        date: '2026-09-02',
        parkingSpotId: 'spot-other',
        parkingSpotLabel: 'E2.93',
        isPreferredSpot: false,
        reservationId: 'res-2',
      },
    ],
    summary: { assigned: 2, queued: 0, unavailable: 0, preferredSpotHits: 1 },
    ...overrides,
  };
}

function dayKey(date: string) {
  return createApiQueryUtils(buildClient() as never).overview.day.queryOptions({ input: { date } })
    .queryKey;
}

function meKey() {
  return createApiQueryUtils(buildClient() as never).me.get.queryOptions().queryKey;
}

interface SetupOptions {
  readonly canReserve?: boolean;
  readonly profile?: MyProfile;
  readonly spots?: readonly ParkingSpot[];
  /** `setup` resets every mock, so a canned answer has to be passed in here. */
  readonly previewOutput?: PreviewBulkOutput;
  readonly confirmOutput?: ConfirmBulkOutput;
  readonly previewFailure?: unknown;
}

function setup(options: SetupOptions = {}) {
  Object.values(apiMocks).forEach((fn) => {
    fn.mockReset();
  });
  if (options.previewFailure === undefined) {
    apiMocks.previewBulk.mockResolvedValue(options.previewOutput ?? preview());
  } else {
    apiMocks.previewBulk.mockRejectedValue(options.previewFailure);
  }
  apiMocks.confirmBulk.mockResolvedValue(options.confirmOutput ?? confirmed());
  apiMocks.spotList.mockResolvedValue({
    spots: options.spots ?? [spot(PREFERRED_SPOT_ID, 'E2.92'), spot('spot-other', 'E2.93')],
  });

  const client = createQueryClient({ defaultOptions: { queries: { retry: false } } });
  const person = options.profile ?? profile();
  client.setQueryData(meKey(), person);
  apiMocks.meGet.mockResolvedValue(person);

  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const onClose = jest.fn();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryProvider client={client}>
        <ApiProvider url="http://localhost:3000/api">
          <IntlProvider>{children}</IntlProvider>
        </ApiProvider>
      </QueryProvider>
    );
  }

  const utils = render(
    <BulkReservationModal
      open
      onClose={onClose}
      anchorDate={ANCHOR}
      canReserve={options.canReserve ?? true}
    />,
    { wrapper: Wrapper }
  );

  return { ...utils, client, invalidate, onClose, user: userEvent.setup() };
}

/** Selects two working days and moves on to the proposal. */
async function reachSchedule(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'úterý 1. září 2026' }));
  await user.click(screen.getByRole('button', { name: 'středa 2. září 2026' }));
  await user.click(screen.getByRole('button', { name: 'Vygenerovat rozvrh (2 dny)' }));
  return screen.findByRole('button', { name: 'Potvrdit rozvrh' });
}

describe('BulkReservationModal — step 1, choosing the days', () => {
  it('draws the month grid with Czech column heads, Monday first', () => {
    setup();
    const heads = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(heads).toEqual(['PO', 'ÚT', 'ST', 'ČT', 'PÁ', 'SO', 'NE']);
  });

  it('names the month in the locative in its own description', () => {
    setup();
    expect(
      screen.getByText(
        'Vyberte dny v září. Místo přiřadíme automaticky — kde nebude volno, zařadíme vás do fronty.'
      )
    ).toBeInTheDocument();
  });

  it('leaves weekends and Czech public holidays unselectable, and says so', () => {
    setup();
    expect(
      screen.getByRole('button', { name: 'sobota 5. září 2026 — nelze vybrat' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'neděle 6. září 2026 — nelze vybrat' })
    ).toBeDisabled();
    // 28 September — Den české státnosti, a Monday in 2026.
    expect(
      screen.getByRole('button', { name: 'pondělí 28. září 2026 — nelze vybrat' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'úterý 1. září 2026' })).toBeEnabled();
    expect(screen.getByText('Víkendy a svátky nelze vybrat.')).toBeInTheDocument();
  });

  it('names the preferred spot under the grid', async () => {
    setup();
    // The label needs `spot.list`, so it says "načítá se…" until that lands —
    // never a blank, and never the raw id.
    expect(screen.getByText('Preferované místo: načítá se…')).toBeInTheDocument();
    expect(await screen.findByText('Preferované místo: E2.92')).toBeInTheDocument();
  });

  it('says the preferred spot is gone rather than rendering a blank label', async () => {
    // The stored id is not among the active spots — it was deactivated after
    // the user chose it. A blank would let the display and the stored value
    // disagree without the user ever seeing it.
    setup({ spots: [spot('spot-other', 'E2.93')] });
    expect(await screen.findByText('Preferované místo: už není k dispozici')).toBeInTheDocument();
    expect(screen.queryByText(/Preferované místo: E2\.92/)).not.toBeInTheDocument();
  });

  it('says there is no preference when the profile stores none', () => {
    setup({ profile: profile({ preferredParkingSpotId: null }) });
    expect(screen.getByText('Preferované místo: nemáte nastavené')).toBeInTheDocument();
  });

  it('offers no way forward until a day is picked', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Vyberte dny' })).toBeDisabled();
  });

  it('counts the selection into the call to action', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'úterý 1. září 2026' }));
    expect(screen.getByRole('button', { name: 'Vygenerovat rozvrh (1 den)' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'středa 2. září 2026' }));
    expect(screen.getByRole('button', { name: 'Vygenerovat rozvrh (2 dny)' })).toBeEnabled();
  });

  it('un-picks a day that is picked again', async () => {
    const { user } = setup();
    const first = screen.getByRole('button', { name: 'úterý 1. září 2026' });

    await user.click(first);
    expect(first).toHaveAttribute('aria-pressed', 'true');

    await user.click(first);
    expect(first).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Vyberte dny' })).toBeDisabled();
  });

  it('forgets the selection between two openings', async () => {
    // The component stays mounted while the modal is shut (`Modal` renders
    // null), so nothing resets this for us — and a selection carried into
    // another month would be a batch the contract refuses.
    const { user, rerender, onClose } = setup();
    await user.click(screen.getByRole('button', { name: 'úterý 1. září 2026' }));
    expect(screen.getByRole('button', { name: 'Vygenerovat rozvrh (1 den)' })).toBeEnabled();

    rerender(
      <BulkReservationModal open={false} onClose={onClose} anchorDate={ANCHOR} canReserve />
    );
    rerender(<BulkReservationModal open onClose={onClose} anchorDate={ANCHOR} canReserve />);

    expect(screen.getByRole('button', { name: 'Vyberte dny' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'úterý 1. září 2026' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('asks for the proposal with the picked days in ascending order', async () => {
    const { user } = setup();
    // Picked out of order on purpose.
    await user.click(screen.getByRole('button', { name: 'čtvrtek 3. září 2026' }));
    await user.click(screen.getByRole('button', { name: 'úterý 1. září 2026' }));
    await user.click(screen.getByRole('button', { name: 'Vygenerovat rozvrh (2 dny)' }));

    await waitFor(() => {
      expect(apiMocks.previewBulk).toHaveBeenCalledWith(
        { dates: ['2026-09-01', '2026-09-03'] },
        expect.anything()
      );
    });
  });
});

describe('BulkReservationModal — step 2, the proposed schedule', () => {
  it('lists every day as date, weekday, spot and badge', async () => {
    const { user } = setup();
    await reachSchedule(user);

    expect(screen.getByText('1. září · úterý')).toBeInTheDocument();
    expect(screen.getByText('2. září · středa')).toBeInTheDocument();
    expect(screen.getByText('Rezervováno · preferované')).toBeInTheDocument();
    expect(screen.getByText('Rezervováno')).toBeInTheDocument();
    expect(screen.getByText('E2.92')).toBeInTheDocument();
    expect(screen.getByText('E2.93')).toBeInTheDocument();
  });

  it('badges a queued day with its position and an impossible day with its reason', async () => {
    const { user } = setup({
      previewOutput: preview({
        days: [
          {
            outcome: 'QUEUED',
            date: '2026-09-01',
            parkingSpotId: 'spot-other',
            parkingSpotLabel: 'E2.93',
            waitlistPosition: 3,
          },
          { outcome: 'UNAVAILABLE', date: '2026-09-02', reason: 'ALREADY_HAS_RESERVATION' },
        ],
        summary: { assigned: 0, queued: 1, unavailable: 1, preferredSpotHits: 0 },
      }),
    });
    await reachSchedule(user);

    expect(screen.getByText('3. ve frontě')).toBeInTheDocument();
    expect(screen.getByText('Už máte rezervaci')).toBeInTheDocument();
  });

  it('summarises the proposal in days with a spot and days in a queue', async () => {
    const { user } = setup({
      previewOutput: preview({
        days: [
          {
            outcome: 'SPOT_ASSIGNED',
            date: '2026-09-01',
            parkingSpotId: PREFERRED_SPOT_ID,
            parkingSpotLabel: 'E2.92',
            isPreferredSpot: true,
          },
          {
            outcome: 'QUEUED',
            date: '2026-09-02',
            parkingSpotId: 'spot-other',
            parkingSpotLabel: 'E2.93',
            waitlistPosition: 1,
          },
        ],
      }),
    });
    await reachSchedule(user);

    expect(screen.getByText('1 den s místem, 1 den ve frontě.')).toBeInTheDocument();
  });

  it('goes back to the grid with the selection intact', async () => {
    const { user } = setup();
    await reachSchedule(user);

    await user.click(screen.getByRole('button', { name: 'Zpět na výběr' }));

    expect(await screen.findByRole('button', { name: 'Vygenerovat rozvrh (2 dny)' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'úterý 1. září 2026' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('confirms with the same days it previewed', async () => {
    const { user } = setup();
    const confirm = await reachSchedule(user);
    await user.click(confirm);

    await waitFor(() => {
      expect(apiMocks.confirmBulk).toHaveBeenCalledWith(
        { dates: ['2026-09-01', '2026-09-02'] },
        expect.anything()
      );
    });
  });
});

describe('BulkReservationModal — the confirmed result against the proposal', () => {
  it('says so plainly when nothing moved', async () => {
    const { user } = setup();
    await user.click(await reachSchedule(user));

    expect(await screen.findByText('Zapsali jsme vás přesně podle návrhu.')).toBeInTheDocument();
    expect(screen.queryByText('Rozvrh se od návrhu liší')).not.toBeInTheDocument();
  });

  it('shows the difference when a promised spot turned into a queue place', async () => {
    // The race `doc/decision/0092-*` deliberately leaves open. Confirming
    // something quietly different from the proposal is the failure this whole
    // two-step flow exists to prevent.
    const { user } = setup({
      confirmOutput: confirmed({
        days: [
          {
            outcome: 'QUEUED',
            date: '2026-09-01',
            parkingSpotId: PREFERRED_SPOT_ID,
            parkingSpotLabel: 'E2.92',
            waitlistPosition: 2,
            waitlistEntryId: 'wl-1',
          },
          {
            outcome: 'SPOT_ASSIGNED',
            date: '2026-09-02',
            parkingSpotId: 'spot-other',
            parkingSpotLabel: 'E2.93',
            isPreferredSpot: false,
            reservationId: 'res-2',
          },
        ],
        summary: { assigned: 1, queued: 1, unavailable: 0, preferredSpotHits: 0 },
      }),
    });
    await user.click(await reachSchedule(user));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Rozvrh se od návrhu liší');
    expect(alert).toHaveTextContent('1. září · úterý');
    expect(alert).toHaveTextContent('Návrh: Rezervováno · preferované · E2.92');
    expect(alert).toHaveTextContent('Skutečnost: 2. ve frontě · E2.92');
    // The day that did not move stays out of the difference list.
    expect(alert).not.toHaveTextContent('2. září');
    expect(screen.queryByText('Zapsali jsme vás přesně podle návrhu.')).not.toBeInTheDocument();
  });

  it('does not close itself on a successful confirmation, so the comparison cannot be skipped', async () => {
    const { user, onClose } = setup();
    await user.click(await reachSchedule(user));

    await screen.findByText('Zapsali jsme vás přesně podle návrhu.');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Hotovo' })).toBeInTheDocument();
  });

  it('invalidates the day overview for every day in the batch', async () => {
    const { user, invalidate } = setup();
    await user.click(await reachSchedule(user));

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: dayKey('2026-09-01') });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: dayKey('2026-09-02') });
  });

  it('invalidates a day even when nothing could be done for it', async () => {
    // Over-invalidating is nearly free; deciding client-side which days the
    // server actually touched would be the re-derivation `doc/decision/0120-*`
    // rules out.
    const { user, invalidate } = setup({
      confirmOutput: confirmed({
        days: [
          { outcome: 'UNAVAILABLE', date: '2026-09-01', reason: 'NO_SPOTS_AVAILABLE' },
          { outcome: 'UNAVAILABLE', date: '2026-09-02', reason: 'NO_SPOTS_AVAILABLE' },
        ],
        summary: { assigned: 0, queued: 0, unavailable: 2, preferredSpotHits: 0 },
      }),
    });
    await user.click(await reachSchedule(user));

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: dayKey('2026-09-01') });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: dayKey('2026-09-02') });
  });
});

describe('BulkReservationModal — what each typed failure says', () => {
  it('tells the user nothing was written when the batch lost a race', async () => {
    const { user } = setup();
    const confirm = await reachSchedule(user);
    apiMocks.confirmBulk.mockRejectedValue(await contractFailure('CONFLICT', 409));

    await user.click(confirm);

    expect(
      await screen.findByText(
        'Někdo jiný mezitím obsadil místa, se kterými rozvrh počítal. Nezapsali jsme nic — vygenerujte rozvrh znovu.'
      )
    ).toBeInTheDocument();
    // Still on the proposal — there is no result to show.
    expect(screen.getByRole('button', { name: 'Potvrdit rozvrh' })).toBeInTheDocument();
  });

  it('does not reuse the single-day reservation copy for a rejected batch', async () => {
    // `errors.VALIDATION_FAILED` says "weekend or holiday", which for a bulk
    // request is never the reason: a weekend is a per-day fact inside a
    // *successful* response (`doc/decision/0090-*`).
    const { user } = setup({
      previewFailure: await contractFailure('VALIDATION_FAILED', 422),
    });

    await user.click(screen.getByRole('button', { name: 'úterý 1. září 2026' }));
    await user.click(screen.getByRole('button', { name: 'Vygenerovat rozvrh (1 den)' }));

    expect(
      await screen.findByText(
        'Výběr dní neprošel kontrolou — vyberte alespoň jeden den a všechny v jednom měsíci.'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Požadavek porušuje pravidlo rezervací (např. víkend nebo svátek).')
    ).not.toBeInTheDocument();
  });

  it('says the month is locked when the API refuses the confirmation', async () => {
    const { user } = setup();
    const confirm = await reachSchedule(user);
    apiMocks.confirmBulk.mockRejectedValue(await contractFailure('RESERVATIONS_LOCKED', 422));

    await user.click(confirm);

    expect(
      await screen.findByText(
        'Rezervace na tento měsíc jsou uzamčené — hromadnou rezervaci už založit nelze.'
      )
    ).toBeInTheDocument();
  });

  it('falls back to the generic sentence for a failure that carries no contract code', async () => {
    const { user } = setup();
    const confirm = await reachSchedule(user);
    apiMocks.confirmBulk.mockRejectedValue(new TypeError('Failed to fetch'));

    await user.click(confirm);

    expect(
      await screen.findByText(
        'Hromadnou rezervaci se nepodařilo dokončit. Zkuste to prosím znovu za chvíli.'
      )
    ).toBeInTheDocument();
  });
});

describe('BulkReservationModal — the locked month is blocked, not merely hidden', () => {
  it('refuses the whole flow when the caller may not reserve in this month', () => {
    // The header hides its button in this case, but hiding a control is not
    // enforcement: this is the modal refusing on its own.
    setup({ canReserve: false });

    expect(screen.getByRole('dialog', { name: 'Rezervace jsou uzamčené' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Rezervace na tento měsíc jsou uzamčené — hromadnou rezervaci teď založit nelze.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vyberte dny' })).not.toBeInTheDocument();
    expect(apiMocks.previewBulk).not.toHaveBeenCalled();
  });

  it('stops a confirmation whose window closed while the modal was open', async () => {
    // The case a hidden header button cannot cover: the user reached the
    // proposal, then the day query refetched and `canReserve` flipped.
    const { user, rerender, onClose } = setup();
    await reachSchedule(user);

    rerender(
      <BulkReservationModal open onClose={onClose} anchorDate={ANCHOR} canReserve={false} />
    );

    expect(screen.getByRole('dialog', { name: 'Rezervace jsou uzamčené' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Potvrdit rozvrh' })).not.toBeInTheDocument();
    expect(apiMocks.confirmBulk).not.toHaveBeenCalled();
  });
});
