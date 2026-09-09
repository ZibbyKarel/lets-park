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
    holderIsGuest: false,
    infoReason: null,
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

interface DialogOverrides {
  spot?: SpotView | null;
  canReserve?: boolean;
  isAdmin?: boolean;
  error?: unknown;
  errorMessage?: string;
  viewerUserId?: string | null;
  holderOptions?: readonly { userId: string; name: string; licensePlate: string | null }[];
  holderPending?: boolean;
}

function renderDialog(overrides: DialogOverrides = {}) {
  const callbacks = {
    onClose: jest.fn(),
    onReserve: jest.fn(),
    onJoinWaitlist: jest.fn(),
    onLeaveWaitlist: jest.fn(),
    onCancelReservation: jest.fn(),
  };

  function tree(props: DialogOverrides) {
    return (
      <IntlProvider locale="cs" messages={cs}>
        <SpotDialog
          spot={props.spot === undefined ? spot() : props.spot}
          date="2026-09-28"
          canReserve={props.canReserve ?? true}
          isAdmin={props.isAdmin ?? false}
          monthName="září"
          error={props.error ?? null}
          {...(props.errorMessage === undefined ? {} : { errorMessage: props.errorMessage })}
          pending={false}
          viewerUserId={props.viewerUserId ?? null}
          holderOptions={props.holderOptions ?? []}
          holderPending={props.holderPending ?? false}
          {...callbacks}
        />
      </IntlProvider>
    );
  }

  const { rerender } = render(tree(overrides));

  return {
    ...callbacks,
    user: userEvent.setup(),
    /**
     * Re-renders with `next` merged over the props this call was made with —
     * the same component instance, which is the point: it is how a prop that
     * arrives *after* mount (a profile query resolving, a second bay opening)
     * gets exercised at all.
     */
    rerender: (next: DialogOverrides) => rerender(tree({ ...overrides, ...next })),
  };
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

  it('explains that the viewer already holds a reservation elsewhere that day, distinctly from a locked month', () => {
    renderDialog({
      spot: spot({ appearance: 'free', action: 'info', infoReason: 'already-reserved' }),
      canReserve: true,
    });

    expect(screen.getByRole('heading', { name: 'Na tento den už máte místo' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Na tento den už máte rezervované jiné místo. Nejdřív ji zrušte, teprve pak si můžete zapsat nebo se zařadit do fronty na jiné místo.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rezervovat' })).not.toBeInTheDocument();
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

  it('hides the queue section from a normal user when nobody is waiting', () => {
    renderDialog({ spot: takenByOther });
    expect(screen.queryByText('Fronta')).not.toBeInTheDocument();
    expect(screen.queryByText('Nikdo nečeká — budete první v řadě.')).not.toBeInTheDocument();
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

  it('renders `errorMessage` instead of the code-mapped copy when the caller supplies one', async () => {
    const error = await failureWithCode('RESERVATION_LIMIT_REACHED');
    renderDialog({
      error,
      errorMessage: 'Tento uživatel už na vybraný den rezervaci má — na den je povolená jen jedna.',
    });

    expect(
      screen.getByText(
        'Tento uživatel už na vybraný den rezervaci má — na den je povolená jen jedna.'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Na tento den už máte rezervaci — na den je povolená jen jedna.')
    ).not.toBeInTheDocument();
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

const OPTIONS = [
  { userId: 'admin-1', name: 'Dev Admin', licensePlate: '1AA 1111' },
  { userId: 'user-2', name: 'Jana Nováková', licensePlate: null },
];

describe('SpotDialog — an admin reserving a free bay', () => {
  function renderAdmin(overrides: Parameters<typeof renderDialog>[0] = {}) {
    return renderDialog({
      isAdmin: true,
      viewerUserId: 'admin-1',
      holderOptions: OPTIONS,
      ...overrides,
    });
  }

  it('offers the holder selector, with the admin themselves preselected', async () => {
    renderAdmin();

    const select = screen.getByLabelText('Rezervovat pro');
    expect(select).toHaveValue('admin-1');
    expect(screen.getByRole('option', { name: 'Hosta' })).toBeInTheDocument();
    // With a plate on file, the option label carries it too — the whole point
    // of a selector that was meant to show "jméno i spz". Without one (Jana
    // Nováková, below), the label is the bare name.
    expect(screen.getByRole('option', { name: 'Dev Admin — 1AA 1111' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Jana Nováková' })).toBeInTheDocument();
  });

  it('reserves for the admin themselves on a single click, with no plate override', async () => {
    // The browser suite's `reserveSpot` does exactly this — opens the dialog
    // and clicks once (`apps/web-e2e/src/support/lot-page.ts:122-125`) — so a
    // form that needed a selection first would take that journey red.
    const { onReserve, user } = renderAdmin();

    await user.click(screen.getByRole('button', { name: 'Rezervovat' }));

    expect(onReserve).toHaveBeenCalledTimes(1);
    expect(onReserve).toHaveBeenCalledWith({
      kind: 'USER',
      userId: 'admin-1',
      licensePlate: null,
    });
  });

  it('reserves for another user, with the plate the admin typed', async () => {
    const { onReserve, user } = renderAdmin();

    await user.selectOptions(screen.getByLabelText('Rezervovat pro'), 'user-2');
    await user.type(screen.getByLabelText('SPZ'), '9XY 8765');
    await user.click(screen.getByRole('button', { name: 'Rezervovat' }));

    expect(onReserve).toHaveBeenCalledWith({
      kind: 'USER',
      userId: 'user-2',
      licensePlate: '9XY 8765',
    });
  });

  it('hints the chosen holder’s stored plate, so blank is not a blank plate', async () => {
    const { user } = renderAdmin();
    const plate = screen.getByLabelText('SPZ');

    expect(plate).toHaveAttribute('placeholder', '1AA 1111');
    await user.selectOptions(screen.getByLabelText('Rezervovat pro'), 'user-2');
    expect(plate).toHaveAttribute('placeholder', 'SPZ neuvedena');
  });

  it('asks for a guest’s name, and refuses to submit without one', async () => {
    const { onReserve, user } = renderAdmin();

    await user.selectOptions(screen.getByLabelText('Rezervovat pro'), 'GUEST');
    await user.click(screen.getByRole('button', { name: 'Rezervovat' }));

    expect(onReserve).not.toHaveBeenCalled();
    expect(await screen.findByText('Zadejte jméno hosta.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Jméno hosta'), 'Jan Host');
    await user.click(screen.getByRole('button', { name: 'Rezervovat' }));

    expect(onReserve).toHaveBeenCalledWith({
      kind: 'GUEST',
      name: 'Jan Host',
      licensePlate: null,
    });
  });

  /**
   * These two are the only tests that exercise the `form.reset` effect
   * (`spot-dialog.tsx:133-139`). Measured: with the `form.reset(...)` call
   * deleted, the rest of this file's 671 tests still pass and only these two
   * fail — which is what a test of a defensive branch is for.
   */
  it('seeds the holder once the viewer id arrives after the dialog was opened', async () => {
    const { onReserve, user, rerender } = renderAdmin({ viewerUserId: null });

    // No `viewerUserId` yet, so the plain self-book path is on screen.
    expect(screen.queryByLabelText('Rezervovat pro')).not.toBeInTheDocument();

    rerender({ viewerUserId: 'admin-1' });

    expect(screen.getByLabelText('Rezervovat pro')).toHaveValue('admin-1');
    await user.click(screen.getByRole('button', { name: 'Rezervovat' }));
    expect(onReserve).toHaveBeenCalledWith({
      kind: 'USER',
      userId: 'admin-1',
      licensePlate: null,
    });
  });

  it('does not carry a guest name from one bay into the next', async () => {
    const { user, rerender } = renderAdmin();

    await user.selectOptions(screen.getByLabelText('Rezervovat pro'), 'GUEST');
    await user.type(screen.getByLabelText('Jméno hosta'), 'Jan Host');

    rerender({ spot: spot({ spotId: 'spot-b', label: 'E2.93' }) });

    expect(screen.getByLabelText('Rezervovat pro')).toHaveValue('admin-1');
    expect(screen.queryByLabelText('Jméno hosta')).not.toBeInTheDocument();
  });

  it('disables Rezervovat while the holder list is still loading, instead of silently booking for the admin', () => {
    // While `admin.user.list` is in flight, `holderOptions` is empty and
    // `showHolderForm` is false — the same shape as a normal user's dialog.
    // Without `holderPending`, one click here would call `onReserve()` with no
    // argument and book the bay for the admin, with no selector ever shown.
    renderAdmin({ holderOptions: [], holderPending: true });

    expect(screen.getByRole('button', { name: 'Rezervovat' })).toBeDisabled();
  });
});

describe('SpotDialog — a normal user reserving a free bay', () => {
  it('sees no holder selector and reserves for themselves', async () => {
    const { onReserve, user } = renderDialog({ viewerUserId: 'user-2', holderOptions: [] });

    expect(screen.queryByLabelText('Rezervovat pro')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rezervovat' }));

    // No argument at all: an omitted holder is "the caller", which is what the
    // contract's optional `holder` was shaped for.
    expect(onReserve).toHaveBeenCalledWith();
  });
});

describe('SpotDialog — a bay a guest holds', () => {
  it('says so beside the name', () => {
    renderDialog({
      spot: spot({
        appearance: 'taken',
        action: 'queue',
        holderName: 'Jan Novotný',
        holderPlate: null,
        holderIsGuest: true,
        carColorClass: 'text-fg-3',
      }),
    });

    expect(screen.getByText('Jan Novotný')).toBeInTheDocument();
    expect(screen.getByText('Host')).toBeInTheDocument();
  });
});

const QUEUE_OPTIONS = [
  { userId: 'admin-1', name: 'Dev Admin', licensePlate: '1AA 1111' },
  { userId: 'user-2', name: 'Jana Nováková', licensePlate: null },
];

describe('SpotDialog — an admin adding somebody to the queue', () => {
  function renderAdminQueue(overrides: Parameters<typeof renderDialog>[0] = {}) {
    return renderDialog({
      spot: takenByOther,
      isAdmin: true,
      viewerUserId: 'admin-1',
      holderOptions: QUEUE_OPTIONS,
      ...overrides,
    });
  }

  it('still shows the queue heading to an admin when nobody is waiting, with a selector', () => {
    renderAdminQueue();

    expect(screen.getByText('Fronta')).toBeInTheDocument();
    expect(screen.getByText('Nikdo nečeká — budete první v řadě.')).toBeInTheDocument();
    expect(screen.getByLabelText('Přidat do fronty')).toHaveValue('admin-1');
    expect(screen.getByRole('option', { name: 'Jana Nováková' })).toBeInTheDocument();
  });

  it('joins the admin themselves on a single click, with no selection required', async () => {
    const { onJoinWaitlist, user } = renderAdminQueue();

    await user.click(screen.getByRole('button', { name: 'Přidat se do fronty' }));

    expect(onJoinWaitlist).toHaveBeenCalledTimes(1);
    expect(onJoinWaitlist).toHaveBeenCalledWith('admin-1');
  });

  it('adds the selected user instead, when the admin picks somebody else', async () => {
    const { onJoinWaitlist, user } = renderAdminQueue();

    await user.selectOptions(screen.getByLabelText('Přidat do fronty'), 'user-2');
    await user.click(screen.getByRole('button', { name: 'Přidat se do fronty' }));

    expect(onJoinWaitlist).toHaveBeenCalledWith('user-2');
  });

  it('does not offer the selector once the admin is already queued', () => {
    renderAdminQueue({
      spot: { ...takenByOther, viewerWaitlistEntryId: 'wait-7' },
    });

    expect(screen.queryByLabelText('Přidat do fronty')).not.toBeInTheDocument();
  });

  it('offers no selector to a normal user, who still joins for themselves', async () => {
    const { onJoinWaitlist, user } = renderDialog({
      spot: takenByOther,
      viewerUserId: 'user-2',
      holderOptions: [],
    });

    expect(screen.queryByLabelText('Přidat do fronty')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Přidat se do fronty' }));
    expect(onJoinWaitlist).toHaveBeenCalledWith();
  });
});
