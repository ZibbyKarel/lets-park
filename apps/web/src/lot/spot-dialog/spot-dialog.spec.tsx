import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from '@lets-park/i18n';
import cs from '../../../messages/cs.json';
import { failureWithCode } from '../../testing/contract-failure';
import { SpotDialog } from './spot-dialog';
import type { SpotView } from '../lot-view';

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
    <IntlProvider locale="cs" messages={cs}>
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

  /**
   * `showCancel`/`showPrimary` are read off three genuinely independent
   * props (`spot`, `canReserve`, `isAdmin` — see the module docs) rather than
   * off a value this component derives once and reuses. Every other test
   * here passes them a *consistent* combination, the one `toSpotView` would
   * actually produce, which cannot tell `showCancel`'s `isTaken` conjunct or
   * `showPrimary`'s `!isInfo` conjunct apart from the rest of the expression:
   * both are measured to fail 0 tests when deleted from a suite that only
   * ever sees consistent props. These two exercise the inconsistent
   * combinations a future reuse (Task 31's bulk flow is the obvious
   * candidate) could pass by accident.
   */
  it('does not offer cancelling on a free bay, even to an admin', () => {
    renderDialog({ spot: spot({ appearance: 'free', action: 'reserve' }), isAdmin: true });
    expect(screen.queryByRole('button', { name: 'Zrušit rezervaci' })).not.toBeInTheDocument();
  });

  it('never offers reserving from the explanatory dialog, whatever canReserve says', () => {
    renderDialog({
      spot: spot({ appearance: 'window-locked', action: 'info' }),
      canReserve: true,
    });
    expect(screen.queryByRole('button', { name: 'Rezervovat' })).not.toBeInTheDocument();
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

  // Found by running the screen in a browser against the real API: the heading
  // read "Přidat se do fronty" above a button reading "Odejít z fronty".
  it('does not head a queued caller’s modal with an invitation to join', () => {
    renderDialog({
      spot: { ...takenByOther, waitlistCount: 1, viewerWaitlistEntryId: 'wait-7' },
    });

    expect(screen.getByRole('heading', { name: 'Jste ve frontě' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Až se místo uvolní, dostane ho první v řadě. Z fronty můžete kdykoliv odejít.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Přidat se do fronty' })).not.toBeInTheDocument();
  });

  it('says the same to a queued admin, whose cancel button is unaffected', () => {
    renderDialog({
      spot: { ...takenByOther, waitlistCount: 1, viewerWaitlistEntryId: 'wait-7' },
      isAdmin: true,
    });

    expect(screen.getByRole('heading', { name: 'Jste ve frontě' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zrušit rezervaci' })).toBeInTheDocument();
  });

  it('still invites a caller who is not queued to join', () => {
    renderDialog({ spot: takenByOther });
    expect(screen.getByRole('heading', { name: 'Přidat se do fronty' })).toBeInTheDocument();
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

describe('SpotDialog — failures', () => {
  it('renders a contract error by its code, never by its message', async () => {
    // The error carries a developer-facing English `message`, which must not
    // reach the page; the Czech sentence comes from the code.
    const error = await failureWithCode('SPOT_ALREADY_RESERVED');
    renderDialog({ error });

    expect(
      screen.getByText('Toto parkovací místo je na daný den už rezervované.')
    ).toBeInTheDocument();
    expect(screen.queryByText('developer-facing')).not.toBeInTheDocument();
  });

  it('renders the window codes the two write actions can raise', async () => {
    const locked = await failureWithCode('RESERVATIONS_LOCKED');
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
