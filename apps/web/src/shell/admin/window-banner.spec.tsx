import { render, screen } from '@testing-library/react';
import type { MonthWindowOverview } from '@lets-park/contract';
import { IntlProvider } from '@lets-park/i18n';
import { STATE_GLYPH, STATE_TONE, WindowBanner } from './window-banner';

/**
 * One class per tone, read off `toast.tsx`'s own `TONE_CLASSES`.
 *
 * Asserting a class is asserting an implementation detail of the primitive, and
 * that is deliberate: the tone is a *colour*, the design uses the colour as the
 * signal, and the only thing a jsdom test can see of a colour is the class that
 * carries it. A rename in `toast.tsx` failing here is the correct outcome — it
 * is a change to what an admin sees.
 */
const TONE_CLASS = {
  success: 'bg-brand-green-100',
  warning: 'bg-brand-yellow-100',
  neutral: 'bg-bg',
} as const;

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

function renderBanner(overrides: Partial<MonthWindowOverview> = {}) {
  render(
    <IntlProvider>
      <WindowBanner window={aWindow(overrides)} />
    </IntlProvider>
  );
}

describe('WindowBanner', () => {
  describe('under the automatic rule', () => {
    it('says a month is open and until when — the design’s own sentence', () => {
      // doc/design/screens/06-admin-overview.png
      renderBanner({ state: 'OPEN', lockMode: 'AUTO' });

      expect(
        screen.getByText('Rezervace na září 2026 jsou otevřené — zapisovat lze do 31. srpna.')
      ).toBeInTheDocument();
    });

    it('says when a month that has not opened yet will', () => {
      renderBanner({ state: 'NOT_YET_OPEN', lockMode: 'AUTO' });

      expect(screen.getByText('Rezervace na září 2026 se otevřou 25. srpna.')).toBeInTheDocument();
    });

    it('says a month is locked, and names no date, because none applies', () => {
      renderBanner({ state: 'LOCKED', lockMode: 'AUTO' });

      expect(screen.getByText('Rezervace na září 2026 jsou uzamčené.')).toBeInTheDocument();
    });
  });

  describe('under an admin override', () => {
    // `windowFrom`/`windowTo` are always the range the AUTO rule *would*
    // produce. Under a forced mode they are hypothetical, so printing one as
    // fact would put a false sentence on screen. These four assertions are the
    // whole reason the copy comes in pairs.
    it('credits the admin and prints no closing date when open is forced', () => {
      renderBanner({ state: 'OPEN', lockMode: 'FORCE_OPEN' });

      expect(
        screen.getByText('Rezervace na září 2026 jsou otevřené — otevření vynutil admin.')
      ).toBeInTheDocument();
      expect(screen.queryByText(/31\. srpna/u)).not.toBeInTheDocument();
    });

    it('credits the admin when locked is forced', () => {
      renderBanner({ state: 'LOCKED', lockMode: 'FORCE_LOCKED' });

      expect(
        screen.getByText('Rezervace na září 2026 jsou uzamčené — uzamčení vynutil admin.')
      ).toBeInTheDocument();
    });

    it('never promises an opening date it cannot stand behind', () => {
      renderBanner({ state: 'NOT_YET_OPEN', lockMode: 'FORCE_LOCKED' });

      expect(screen.getByText('Rezervace na září 2026 zatím nejsou otevřené.')).toBeInTheDocument();
      expect(screen.queryByText(/25\. srpna/u)).not.toBeInTheDocument();
    });
  });

  it('names the month in the nominative, with its year', () => {
    renderBanner({ month: '2026-08', windowFrom: '2026-07-25', windowTo: '2026-07-31' });

    expect(screen.getByText(/^Rezervace na srpen 2026 /u)).toBeInTheDocument();
  });

  describe('the colour and glyph, which are the signal before the words are', () => {
    // `06-admin-overview.png` paints the open banner green. Yellow means locked
    // and grey means not open yet, matching the month pills in
    // `05-admin-window.png`. A locked month drawn green is a lie an admin acts
    // on without reading a word.
    const DESIGN_TONE = { OPEN: 'success', LOCKED: 'warning', NOT_YET_OPEN: 'neutral' } as const;
    const DESIGN_GLYPH = { OPEN: '✓', LOCKED: '🔒', NOT_YET_OPEN: '…' } as const;

    it('maps each state to the colour the design gives it', () => {
      expect(STATE_TONE).toEqual(DESIGN_TONE);
    });

    it('maps each state to its own glyph', () => {
      expect(STATE_GLYPH).toEqual(DESIGN_GLYPH);
    });

    it.each(['OPEN', 'LOCKED', 'NOT_YET_OPEN'] as const)(
      'paints a %s month in that colour, and marks it with that glyph',
      (state) => {
        renderBanner({ state });

        // Not `STATE_TONE[state]`: reading the map the render used would pass
        // whatever the map said, which is the mutant this exists to catch.
        expect(screen.getByRole('status').className.split(/\s+/u)).toContain(
          TONE_CLASS[DESIGN_TONE[state]]
        );
        expect(screen.getByText(DESIGN_GLYPH[state])).toBeInTheDocument();
      }
    );
  });

  it('is announced politely, as a status rather than an alert', () => {
    renderBanner({ state: 'OPEN' });

    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
