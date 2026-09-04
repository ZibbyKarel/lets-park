import type { MonthWindowOverview } from '@lets-park/contract';
import { BANNER_STATE_TONE, STATE_GLYPH, toAdminWindowBannerView } from './window-view';

function aWindow(overrides: Partial<MonthWindowOverview> = {}): MonthWindowOverview {
  return {
    month: '2026-09',
    windowFrom: '2026-08-25',
    windowTo: '2026-08-31',
    state: 'OPEN',
    lockMode: 'AUTO',
    ...overrides,
  };
}

describe('toAdminWindowBannerView', () => {
  describe('under the automatic rule', () => {
    it('names the closing day of an open month', () => {
      expect(toAdminWindowBannerView(aWindow({ state: 'OPEN' }))).toEqual({
        tone: 'success',
        glyph: '✓',
        messageKey: 'bannerOpenAuto',
        values: { month: 'září 2026', until: '31. srpna', from: '25. srpna' },
      });
    });

    it('names the opening day of a month that has not opened yet', () => {
      const view = toAdminWindowBannerView(aWindow({ state: 'NOT_YET_OPEN' }));

      expect(view.messageKey).toBe('bannerNotYetOpenAuto');
      expect(view.values.from).toBe('25. srpna');
    });

    it('has a locked month, whose message names no date, carry the dates anyway', () => {
      // The values are one shape for all six keys, so the call site never has
      // to vary its argument — the same contract `lot-view.ts` states. A key
      // that does not interpolate a date simply does not print it.
      const view = toAdminWindowBannerView(aWindow({ state: 'LOCKED' }));

      expect(view.messageKey).toBe('bannerLockedAuto');
      expect(view.values).toEqual({ month: 'září 2026', until: '31. srpna', from: '25. srpna' });
    });
  });

  describe('under an admin override', () => {
    // The property this module exists for: `windowFrom`/`windowTo` are the
    // range the automatic rule *would* have produced, so a forced month that
    // quoted one would put a false statement on screen.
    const FORCED_KEY = {
      OPEN: 'bannerOpenForced',
      LOCKED: 'bannerLockedForced',
      NOT_YET_OPEN: 'bannerNotYetOpenForced',
    } as const;

    it.each(['FORCE_OPEN', 'FORCE_LOCKED'] as const)(
      'blanks both dates under %s, whatever the state',
      (lockMode) => {
        for (const state of ['OPEN', 'LOCKED', 'NOT_YET_OPEN'] as const) {
          const view = toAdminWindowBannerView(aWindow({ state, lockMode }));

          expect(view.values.until).toBe('');
          expect(view.values.from).toBe('');
          expect(view.messageKey).toBe(FORCED_KEY[state]);
        }
      }
    );

    it('still names the month, which is a fact under either mode', () => {
      const view = toAdminWindowBannerView(aWindow({ lockMode: 'FORCE_OPEN' }));

      expect(view.values.month).toBe('září 2026');
    });
  });

  it('paints and marks by state, never by mode — an admin scans the colour first', () => {
    for (const state of ['OPEN', 'LOCKED', 'NOT_YET_OPEN'] as const) {
      for (const lockMode of ['AUTO', 'FORCE_OPEN', 'FORCE_LOCKED'] as const) {
        const view = toAdminWindowBannerView(aWindow({ state, lockMode }));

        expect(view.tone).toBe(BANNER_STATE_TONE[state]);
        expect(view.glyph).toBe(STATE_GLYPH[state]);
      }
    }
  });
});
