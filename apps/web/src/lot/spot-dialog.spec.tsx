import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createApiClient } from '@lets-park/api-client';
import { IntlProvider } from '@lets-park/i18n';
import { SpotDialog } from './spot-dialog';
import type { SpotView } from './lot-view';

/**
 * Which actions the dialog offers, in which state.
 *
 * These are the assertions that pin the reservation-window rules the brief is
 * strictest about: a normal user in a month they may not book must not be
 * offered a way to book it, but must keep the way out of what they already
 * have. Both halves are checked, in both directions.
 */

function spot(overrides: Partial<SpotView> = {}): SpotView {
  return {
    spotId: 'spot-a',
    label: 'E2.92',
    appearance: 'free',
    action: 'reserve',
    holderName: null,
    holderPlate: null,
    carColorClass: null,
    editorName: null,
    waitlistCount: 0,
    isMine: false,
    viewerWaitlistEntryId: null,
    viewerWaitlistPosition: null,
    showAdminMenu: false,
    ...overrides,
  };
}

const takenByOther = spot({
  appearance: 'taken',
  action: 'queue',
  holderName: 'Petr Novák',
  holderPlate: '8SC 9012',
  carColorClass: 'text-car-2',
});

const mine = spot({
  appearance: 'taken',
  action: 'mine',
  isMine: true,
  holderName: 'Karel Zíbar',
  holderPlate: '4AB 1234',
  carColorClass: 'text-car-3',
});

function renderDialog(
  overrides: {
    spot?: SpotView | null;
    canReserve?: boolean;
    isAdmin?: boolean;
    error?: unknown;
  } = {}
) {
  const callbacks = {
    onClose: jest.fn(),
    onReserve: jest.fn(),
    onJoinWaitlist: jest.fn(),
    onLeaveWaitlist: jest.fn(),
    onCancelReservation: jest.fn(),
  };

  render(
    <IntlProvider>
      <SpotDialog
        spot={overrides.spot === undefined ? spot() : overrides.spot}
        date="2026-09-28"
        canReserve={overrides.canReserve ?? true}
        isAdmin={overrides.isAdmin ?? false}
        monthName="září"
        error={overrides.error ?? null}
        pending={false}
        {...callbacks}
      />
    </IntlProvider>
  );

  return { ...callbacks, user: userEvent.setup() };
}

describe('SpotDialog', () => {
  it('renders nothing when no bay is open', () => {
    renderDialog({ spot: null });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('names the bay in the eyebrow', () => {
    renderDialog();
    expect(screen.getByText('Místo E2.92')).toBeInTheDocument();
  });
});

describe('SpotDialog — a free bay', () => {
  it('offers reserving it', async () => {
    const { onReserve, user } = renderDialog();

    expect(screen.getByRole('heading', { name: 'Rezervovat místo' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rezervovat' }));
    expect(onReserve).toHaveBeenCalledTimes(1);
  });

  it('explains rather than offering, in a month the caller may not book', () => {
    renderDialog({
      spot: spot({ appearance: 'window-locked', action: 'info' }),
      canReserve: false,
    });

    expect(screen.getByRole('heading', { name: 'Rezervace uzamčeny' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rezervovat' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zavřít' })).toBeInTheDocument();
  });
});

describe('SpotDialog — a bay somebody else holds', () => {
  it('shows the holder and the queue, and offers joining it', async () => {
    const { onJoinWaitlist, user } = renderDialog({
      spot: { ...takenByOther, waitlistCount: 2 },
    });

    expect(screen.getByText('Petr Novák')).toBeInTheDocument();
    expect(screen.getByText('obsazeno · 8SC 9012')).toBeInTheDocument();
    expect(screen.getByText('Fronta')).toBeInTheDocument();
    expect(screen.getByText('2 ve frontě')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Přidat se do fronty' }));
    expect(onJoinWaitlist).toHaveBeenCalledTimes(1);
  });

  it('says the queue is empty rather than showing nothing', () => {
    renderDialog({ spot: takenByOther });
    expect(screen.getByText('Nikdo nečeká — budete první v řadě.')).toBeInTheDocument();
  });

  it('tells a queued caller where they stand, and offers leaving', async () => {
    const { onLeaveWaitlist, user } = renderDialog({
      spot: {
        ...takenByOther,
        waitlistCount: 3,
        viewerWaitlistEntryId: 'wait-7',
        viewerWaitlistPosition: 2,
      },
    });

    expect(screen.getByText('Ve frontě jste 2. v pořadí.')).toBeInTheDocument();
    // Joining a queue you are already in is `ALREADY_IN_WAITLIST`, so the two
    // actions are alternatives rather than both being offered.
    expect(screen.queryByRole('button', { name: 'Přidat se do fronty' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Odejít z fronty' }));
    expect(onLeaveWaitlist).toHaveBeenCalledTimes(1);
  });

  it('hides joining, and shows the yellow note, in a locked month', () => {
    renderDialog({ spot: takenByOther, canReserve: false });

    expect(screen.queryByRole('button', { name: 'Přidat se do fronty' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Rezervace na září jsou uzamčené — nové zápisy ani frontu už nelze měnit.')
    ).toBeInTheDocument();
  });

  it('does not offer a normal user the cancel button on somebody else’s spot', () => {
    renderDialog({ spot: takenByOther });
    expect(screen.queryByRole('button', { name: 'Zrušit rezervaci' })).not.toBeInTheDocument();
  });

  it('does offer an admin the cancel button on somebody else’s spot', async () => {
    const { onCancelReservation, user } = renderDialog({ spot: takenByOther, isAdmin: true });

    await user.click(screen.getByRole('button', { name: 'Zrušit rezervaci' }));
    expect(onCancelReservation).toHaveBeenCalledTimes(1);
  });

  it('keeps an admin’s cancel button in a locked month', () => {
    // `reservation.cancel` declares no window errors at all: "a locked window
    // stops people from taking spots, not from giving them back."
    renderDialog({ spot: takenByOther, isAdmin: true, canReserve: false });
    expect(screen.getByRole('button', { name: 'Zrušit rezervaci' })).toBeInTheDocument();
  });
});

describe('SpotDialog — the caller’s own reservation', () => {
  it('offers cancelling and nothing else', async () => {
    const { onCancelReservation, onJoinWaitlist, user } = renderDialog({ spot: mine });

    expect(screen.getByRole('heading', { name: 'Vaše rezervace' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Přidat se do fronty' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Zrušit rezervaci' }));
    expect(onCancelReservation).toHaveBeenCalledTimes(1);
    expect(onJoinWaitlist).not.toHaveBeenCalled();
  });

  it('keeps cancelling available in a locked month, and says so', () => {
    // The brief's rule, and the contract's: `Zrušit rezervaci` stays available
    // to the holder whatever the window is doing.
    renderDialog({ spot: mine, canReserve: false });

    expect(screen.getByRole('button', { name: 'Zrušit rezervaci' })).toBeEnabled();
    expect(
      screen.getByText(
        'Měsíc je uzamčený — novou rezervaci už nezaložíte, tuhle ale můžete kdykoliv zrušit.'
      )
    ).toBeInTheDocument();
  });
});

/**
 * A failure produced by a **real** `RPCLink`, with only the `fetch` at the
 * bottom replaced — the same technique, and for the same reason, as
 * `shell/screen-state.spec.tsx`: a hand-built error object asserts this
 * file's idea of the wire shape instead of the transport's. The first version
 * of the test below did construct one by hand, and it passed the developer's
 * intent while failing against the real shape — which is precisely the failure
 * mode `doc/frontend.md` warns about.
 */
async function contractFailure(code: string, status: number, message: string): Promise<unknown> {
  const client = createApiClient({
    url: 'https://api.test/rpc',
    fetch: async () =>
      // The payload is **not** at the top level: oRPC's RPC protocol wraps
      // every body in its `{ json, meta }` envelope. Getting that wrong is
      // exactly what a hand-built error object hides — the first draft of
      // this helper omitted it and produced an error `toContractError` could
      // not read, which is the same silence a genuinely unrecognised code
      // would produce.
      new Response(JSON.stringify({ json: { defined: false, code, status, message }, meta: [] }), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  });

  const marker = Symbol('resolved');
  const outcome = await client.me.get().then(
    () => marker,
    (error: unknown) => error
  );
  if (outcome === marker) throw new Error('expected the call to reject, but it resolved');
  return outcome;
}

describe('SpotDialog — failures', () => {
  it('renders a contract error by its code, never by its message', async () => {
    // The error carries a developer-facing English `message`, which must not
    // reach the page; the Czech sentence comes from the code.
    const error = await contractFailure(
      'SPOT_ALREADY_RESERVED',
      409,
      'The spot is already reserved for that day.'
    );
    renderDialog({ error });

    expect(
      screen.getByText('Toto parkovací místo je na daný den už rezervované.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('The spot is already reserved for that day.')
    ).not.toBeInTheDocument();
  });

  it('renders the window codes the two write actions can raise', async () => {
    const locked = await contractFailure('RESERVATIONS_LOCKED', 403, 'Reservations are locked.');
    renderDialog({ error: locked });

    expect(screen.getByText('Rezervační okno pro tento měsíc je už uzamčené.')).toBeInTheDocument();
  });

  it('falls back to one generic sentence for a failure that is not in the contract', () => {
    renderDialog({ error: new TypeError('Failed to fetch') });

    expect(screen.getByText('Zkuste to prosím znovu za chvíli.')).toBeInTheDocument();
    expect(screen.queryByText('Failed to fetch')).not.toBeInTheDocument();
  });

  it('shows no failure block when there is no failure', () => {
    renderDialog();
    expect(screen.queryByText('Něco se nepovedlo')).not.toBeInTheDocument();
  });
});
