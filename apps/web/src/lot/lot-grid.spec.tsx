import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from '@lets-park/i18n';
import { LotGrid } from './lot-grid';
import type { SpotGroupView, SpotView } from './lot-view';

/**
 * The real `IntlProvider` and the real primitives, not doubles: what is under
 * test is what the composition draws and what it reports back, and the Czech
 * copy is part of that — a screen whose strings had drifted out of
 * `libs/i18n` would still pass a suite that stubbed the translator.
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

function group(spots: SpotView[], overrides: Partial<SpotGroupView> = {}): SpotGroupView {
  return {
    group: 'IT',
    spots,
    freeCount: spots.filter((one) => one.appearance === 'free').length,
    totalCount: spots.length,
    ...overrides,
  };
}

function renderGrid(groups: SpotGroupView[]) {
  const onOpenSpot = jest.fn();
  const onAdminOpenSpot = jest.fn();

  render(
    <IntlProvider>
      <LotGrid groups={groups} onOpenSpot={onOpenSpot} onAdminOpenSpot={onAdminOpenSpot} />
    </IntlProvider>
  );

  return { onOpenSpot, onAdminOpenSpot, user: userEvent.setup() };
}

describe('LotGrid', () => {
  it('labels each band with its group and its free count', () => {
    renderGrid([
      group([spot(), spot({ spotId: 'b', label: 'E2.93' })], { freeCount: 1, totalCount: 4 }),
    ]);

    expect(screen.getByRole('heading', { level: 2, name: 'IT' })).toBeInTheDocument();
    expect(screen.getByText('1 z 4 volných')).toBeInTheDocument();
  });

  it('renders the groups it is given, in the order it is given them', () => {
    renderGrid([
      group([spot()], { group: 'IT' }),
      group([spot({ spotId: 'b', label: 'E2.65' })], { group: 'SHARED' }),
    ]);

    const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
    expect(headings).toEqual(['IT', 'SHARED']);
  });

  it('draws a free bay as bookable and reports the click', async () => {
    const { onOpenSpot, user } = renderGrid([group([spot()])]);

    expect(screen.getByText('Volné')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rezervovat místo E2.92' }));
    expect(onOpenSpot).toHaveBeenCalledWith('spot-a');
  });

  it('draws an occupied bay with the holder and the plate', () => {
    renderGrid([
      group([
        spot({
          appearance: 'taken',
          action: 'queue',
          holderName: 'Petr Novák',
          holderPlate: '8SC 9012',
          carColorClass: 'text-car-2',
        }),
      ]),
    ]);

    expect(screen.getByText('Petr Novák')).toBeInTheDocument();
    expect(screen.getByText('8SC 9012')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Otevřít místo E2.92' })).toBeEnabled();
  });

  it('says so rather than showing a blank line when a holder has no plate', () => {
    renderGrid([
      group([
        spot({
          appearance: 'taken',
          action: 'queue',
          holderName: 'Petr Novák',
          holderPlate: null,
          carColorClass: 'text-car-2',
        }),
      ]),
    ]);

    expect(screen.getByText('SPZ neuvedena')).toBeInTheDocument();
  });

  it('draws a window-locked bay and still lets it be opened for the explanation', async () => {
    const { onOpenSpot, user } = renderGrid([
      group([spot({ appearance: 'window-locked', action: 'info' })]),
    ]);

    expect(screen.getByText('rezervace uzamčeny')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Otevřít místo E2.92' }));
    expect(onOpenSpot).toHaveBeenCalledWith('spot-a');
  });

  it('disables a bay somebody else is editing, and names them', async () => {
    // Genuinely `disabled`, not merely ignoring clicks: that is what keeps it
    // out of the tab order too, which the design's pointer-only early return
    // does not.
    const { onOpenSpot, user } = renderGrid([
      group([spot({ appearance: 'editing', action: 'none', editorName: 'Jana Dvořáková' })]),
    ]);

    const tile = screen.getByRole('button', { name: 'Otevřít místo E2.92' });
    expect(tile).toBeDisabled();
    expect(screen.getByText('právě upravuje')).toBeInTheDocument();
    expect(screen.getByText('Jana Dvořáková')).toBeInTheDocument();

    await user.click(tile);
    expect(onOpenSpot).not.toHaveBeenCalled();
  });

  it('shows the waitlist pill when somebody is queued', () => {
    renderGrid([group([spot({ waitlistCount: 2 })])]);
    expect(screen.getByText('2 ve frontě')).toBeInTheDocument();
  });

  it('draws no waitlist pill for an empty queue', () => {
    renderGrid([group([spot({ waitlistCount: 0 })])]);
    expect(screen.queryByText(/ve frontě/u)).not.toBeInTheDocument();
  });

  it('routes the ⋯ menu to its own callback, not to the tile’s', async () => {
    // A separate callback because it is a different intent, and a sibling
    // button because a button inside a button is invalid HTML.
    const { onOpenSpot, onAdminOpenSpot, user } = renderGrid([
      group([
        spot({
          appearance: 'taken',
          action: 'queue',
          holderName: 'Petr Novák',
          carColorClass: 'text-car-2',
          showAdminMenu: true,
        }),
      ]),
    ]);

    await user.click(screen.getByRole('button', { name: 'Možnosti místa E2.92' }));
    expect(onAdminOpenSpot).toHaveBeenCalledWith('spot-a');
    expect(onOpenSpot).not.toHaveBeenCalled();
  });

  it('draws no ⋯ menu when the view says not to', () => {
    renderGrid([
      group([
        spot({
          appearance: 'taken',
          action: 'queue',
          holderName: 'Petr Novák',
          carColorClass: 'text-car-2',
          showAdminMenu: false,
        }),
      ]),
    ]);

    expect(screen.queryByRole('button', { name: 'Možnosti místa E2.92' })).not.toBeInTheDocument();
  });

  it('draws the legend once, below the groups', () => {
    renderGrid([group([spot()]), group([spot({ spotId: 'b' })], { group: 'SHARED' })]);

    expect(screen.getByText('obsazeno')).toBeInTheDocument();
    expect(screen.getByText('volné')).toBeInTheDocument();
    expect(screen.getByText('waitlist / editace')).toBeInTheDocument();
  });
});
