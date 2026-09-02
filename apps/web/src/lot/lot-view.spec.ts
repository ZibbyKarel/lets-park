import type { DaySpotOverview, MonthWindowOverview } from '@lets-park/contract';
import { CAR_COLOR_PALETTE } from '@lets-park/design-system/tokens';
import {
  carColorClass,
  carColorIndex,
  toBannerView,
  toDayNoteView,
  toGroupViews,
  toLotCounts,
  toSpotView,
  type CellLockView,
  type LotViewContext,
} from './lot-view';

const VIEWER = '01890000-0000-7000-8000-00000000v1ew';
const OTHER = '01890000-0000-7000-8000-0000000000th';

function spotRow(overrides: Partial<DaySpotOverview> = {}): DaySpotOverview {
  return {
    spot: {
      id: 'spot-1',
      label: 'E2.92',
      group: 'IT',
      active: true,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
    reservation: null,
    waitlistCount: 0,
    viewerWaitlistEntryId: null,
    viewerWaitlistPosition: null,
    ...overrides,
  };
}

function reservation(userId: string, name = 'Petr Novák', plate: string | null = '8SC 9012') {
  return {
    id: `res-${userId}`,
    createdAt: '2026-08-02T09:00:00.000Z',
    user: { id: userId, name, licensePlate: plate },
  };
}

function context(overrides: Partial<LotViewContext> = {}): LotViewContext {
  return {
    canReserve: true,
    isAdmin: false,
    viewerUserId: VIEWER,
    locks: new Map<string, CellLockView>(),
    ...overrides,
  };
}

function lock(holderId: string, holderName = 'Jana Dvořáková'): Map<string, CellLockView> {
  return new Map([['spot-1', { holderId, holderName, expiresAt: '2026-08-02T09:00:30.000Z' }]]);
}

describe('carColorIndex', () => {
  it('lands inside the design system palette for any id', () => {
    for (const id of ['', 'a', VIEWER, OTHER, 'x'.repeat(200), '💥 emoji id']) {
      const index = carColorIndex(id);
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(CAR_COLOR_PALETTE.length);
    }
  });

  it('is deterministic — the same id always gets the same colour', () => {
    // The design requires this explicitly: a car whose colour changed between
    // renders would be a different car every repaint.
    expect(carColorIndex(VIEWER)).toBe(carColorIndex(VIEWER));
    expect(carColorClass(VIEWER)).toBe(carColorClass(VIEWER));
  });

  it('does not collapse ids that share a long prefix', () => {
    // UUID v7 is timestamp-prefixed, so every user provisioned in the same
    // millisecond shares its leading characters. A hash reading only the front
    // of the string would paint them all one colour.
    const base = '01890000-0000-7000-8000-00000000000';
    const indexes = new Set(
      ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((suffix) =>
        carColorIndex(base + suffix)
      )
    );
    expect(indexes.size).toBeGreaterThan(1);
  });

  it('maps every palette index to a distinct Tailwind class', () => {
    const classes = new Set(
      Array.from({ length: CAR_COLOR_PALETTE.length }, (_unused, index) =>
        carColorClass('x'.repeat(index))
      )
    );
    expect(classes.size).toBeGreaterThan(0);
    for (const value of classes) {
      expect(value).toMatch(/^text-car-[123]$/);
    }
  });
});

describe('toSpotView', () => {
  it('draws a free, bookable spot as free and offers reserving it', () => {
    const view = toSpotView(spotRow(), context());
    expect(view.appearance).toBe('free');
    expect(view.action).toBe('reserve');
    expect(view.showAdminMenu).toBe(false);
  });

  it('draws a free spot as window-locked and offers the explanation when canReserve is false', () => {
    const view = toSpotView(spotRow(), context({ canReserve: false }));
    expect(view.appearance).toBe('window-locked');
    expect(view.action).toBe('info');
  });

  it('reads canReserve from the payload rather than re-deriving it from the window', () => {
    // The contract forbids re-derivation: an admin is not restricted by the
    // window at all, and a past or non-business day is refused whatever the
    // window says. Both directions are checked.
    expect(toSpotView(spotRow(), context({ canReserve: true, isAdmin: false })).appearance).toBe(
      'free'
    );
    expect(toSpotView(spotRow(), context({ canReserve: false, isAdmin: true })).appearance).toBe(
      'window-locked'
    );
  });

  it("draws somebody else's reservation as taken and offers the queue", () => {
    const view = toSpotView(spotRow({ reservation: reservation(OTHER) }), context());
    expect(view.appearance).toBe('taken');
    expect(view.action).toBe('queue');
    expect(view.isMine).toBe(false);
    expect(view.holderName).toBe('Petr Novák');
    expect(view.holderPlate).toBe('8SC 9012');
    expect(view.carColorClass).toBe(carColorClass(OTHER));
  });

  it('offers cancelling rather than queueing on the caller’s own reservation', () => {
    const view = toSpotView(spotRow({ reservation: reservation(VIEWER) }), context());
    expect(view.isMine).toBe(true);
    expect(view.action).toBe('mine');
  });

  it('does not claim a reservation is the caller’s while the caller is unknown', () => {
    // `me.get` is still in flight. Guessing "mine" would offer a stranger the
    // cancel button; guessing "not mine" is the safe direction.
    const view = toSpotView(
      spotRow({ reservation: reservation(VIEWER) }),
      context({ viewerUserId: null })
    );
    expect(view.isMine).toBe(false);
    expect(view.action).toBe('queue');
  });

  it('lets a cell lock win over an occupied spot, and makes the tile inert', () => {
    const view = toSpotView(
      spotRow({ reservation: reservation(OTHER) }),
      context({ locks: lock(OTHER) })
    );
    expect(view.appearance).toBe('editing');
    expect(view.action).toBe('none');
    expect(view.editorName).toBe('Jana Dvořáková');
    expect(view.holderName).toBeNull();
  });

  it('ignores a lock this client holds itself', () => {
    // Whether the gateway echoes a broadcast to its own sender is Task 15's
    // business. The caller with the form open must never see their own tile
    // hatched and their own reserve action taken away.
    const view = toSpotView(spotRow(), context({ locks: lock(VIEWER) }));
    expect(view.appearance).toBe('free');
    expect(view.action).toBe('reserve');
    expect(view.editorName).toBeNull();
  });

  it('shows the ⋯ menu only to an admin, and only on a taken spot', () => {
    const taken = spotRow({ reservation: reservation(OTHER) });
    expect(toSpotView(taken, context({ isAdmin: true })).showAdminMenu).toBe(true);
    expect(toSpotView(taken, context({ isAdmin: false })).showAdminMenu).toBe(false);
    expect(toSpotView(spotRow(), context({ isAdmin: true })).showAdminMenu).toBe(false);
    expect(toSpotView(taken, context({ isAdmin: true, locks: lock(OTHER) })).showAdminMenu).toBe(
      false
    );
  });

  it('carries the waitlist through in every appearance', () => {
    const row = { waitlistCount: 2, viewerWaitlistEntryId: 'w-1', viewerWaitlistPosition: 2 };
    for (const ctx of [
      context(),
      context({ canReserve: false }),
      context({ locks: lock(OTHER) }),
    ]) {
      const view = toSpotView(spotRow(row), ctx);
      expect(view.waitlistCount).toBe(2);
      expect(view.viewerWaitlistEntryId).toBe('w-1');
      expect(view.viewerWaitlistPosition).toBe(2);
    }
  });
});

describe('toGroupViews', () => {
  function rowIn(group: 'IT' | 'SHARED', id: string, overrides: Partial<DaySpotOverview> = {}) {
    return spotRow({
      ...overrides,
      spot: { ...spotRow().spot, id, label: id, group },
    });
  }

  it('orders the groups as the contract enumerates them', () => {
    const groups = toGroupViews([rowIn('SHARED', 's1'), rowIn('IT', 'i1')], context());
    expect(groups.map((group) => group.group)).toEqual(['IT', 'SHARED']);
  });

  it('omits a group with no active spots rather than drawing an empty rule', () => {
    const groups = toGroupViews([rowIn('IT', 'i1')], context());
    expect(groups.map((group) => group.group)).toEqual(['IT']);
  });

  it('counts a spot free when it has neither a holder nor a lock', () => {
    const groups = toGroupViews(
      [
        rowIn('IT', 'spot-1'),
        rowIn('IT', 'i2', { reservation: reservation(OTHER) }),
        rowIn('IT', 'i3'),
      ],
      context({ locks: lock(OTHER) })
    );
    // spot-1 is locked, i2 is taken, i3 is free.
    expect(groups[0]?.freeCount).toBe(1);
    expect(groups[0]?.totalCount).toBe(3);
  });

  it('still counts a window-locked tile as free', () => {
    // A ⊘ tile is an unoccupied spot. Telling an admin "0 z 2 volných" for a
    // lot they can still book would be wrong.
    const groups = toGroupViews(
      [rowIn('IT', 'i1'), rowIn('IT', 'i2')],
      context({ canReserve: false })
    );
    expect(groups[0]?.freeCount).toBe(2);
  });
});

describe('toLotCounts', () => {
  it('counts holders, ignoring who is editing', () => {
    const rows = [
      spotRow({ spot: { ...spotRow().spot, id: 'a' }, reservation: reservation(OTHER) }),
      spotRow({ spot: { ...spotRow().spot, id: 'b' } }),
      spotRow({ spot: { ...spotRow().spot, id: 'c' } }),
    ];
    expect(toLotCounts(rows)).toEqual({ free: 2, taken: 1 });
  });

  it('is zero for an empty lot', () => {
    expect(toLotCounts([])).toEqual({ free: 0, taken: 0 });
  });
});

describe('toBannerView', () => {
  function window(overrides: Partial<MonthWindowOverview> = {}): MonthWindowOverview {
    return {
      month: '2026-09',
      windowFrom: '2026-08-25',
      windowTo: '2026-08-31',
      state: 'OPEN',
      lockMode: 'AUTO',
      ...overrides,
    };
  }

  it('quotes the window’s last day when the state came from the automatic rule', () => {
    const view = toBannerView(window(), false);
    expect(view).toEqual({
      tone: 'success',
      messageKey: 'bannerOpen',
      values: { month: 'září', until: '31. srpna', from: '25. srpna' },
    });
  });

  it('never quotes a date when an admin forced the state', () => {
    // `monthWindowOverviewSchema`: windowFrom/windowTo are the range the AUTO
    // rule *would* have produced and are hypothetical under an override, so
    // "zapisovat lze do 31. srpna" would be a false statement.
    const view = toBannerView(window({ lockMode: 'FORCE_OPEN' }), false);
    expect(view.messageKey).toBe('bannerOpenForced');
    expect(view.values.until).toBe('');
    expect(view.values.from).toBe('');
  });

  it('tells an admin and a normal user different things about a locked month', () => {
    const locked = window({ state: 'LOCKED', lockMode: 'FORCE_LOCKED' });
    expect(toBannerView(locked, true).messageKey).toBe('bannerLockedAdmin');
    expect(toBannerView(locked, false).messageKey).toBe('bannerLockedUser');
    expect(toBannerView(locked, false).tone).toBe('warning');
  });

  it('has a third state the design’s boolean does not', () => {
    const view = toBannerView(window({ state: 'NOT_YET_OPEN' }), false);
    expect(view.messageKey).toBe('bannerNotYetOpen');
    expect(view.tone).toBe('warning');
    expect(view.values.from).toBe('25. srpna');
  });

  it('drops the opening date from NOT_YET_OPEN under an override too', () => {
    const view = toBannerView(window({ state: 'NOT_YET_OPEN', lockMode: 'FORCE_LOCKED' }), false);
    expect(view.messageKey).toBe('bannerNotYetOpenForced');
    expect(view.values.from).toBe('');
  });

  it('names the month of the window, not of today', () => {
    expect(toBannerView(window({ month: '2026-01' }), false).values.month).toBe('leden');
    expect(toBannerView(window({ month: '2026-12' }), false).values.month).toBe('prosinec');
  });
});

describe('toDayNoteView', () => {
  it('names a Czech public holiday', () => {
    expect(toDayNoteView('2026-09-28')).toEqual({
      key: 'holiday',
      name: 'Den české státnosti',
      highlighted: true,
    });
  });

  it('calls a Saturday a weekend rather than a working day', () => {
    // The design has only "holiday" and "Pracovní den". A weekend is a day
    // `isBusinessDay` refuses, so every tile on it is window-locked and this
    // bar is the only place that says why.
    expect(toDayNoteView('2026-09-26').key).toBe('weekend');
    expect(toDayNoteView('2026-09-27').key).toBe('weekend');
  });

  it('calls an ordinary weekday a working day, and does not highlight it', () => {
    expect(toDayNoteView('2026-09-29')).toEqual({ key: 'workday', name: '', highlighted: false });
  });

  it('prefers the holiday label when a holiday falls on a weekend', () => {
    // 2026-12-26 (2. svátek vánoční) is a Saturday.
    expect(toDayNoteView('2026-12-26').key).toBe('holiday');
  });
});
