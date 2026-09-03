import { render, screen } from '@testing-library/react';
import type { MonthWindowOverview } from '@lets-park/contract';
import { IntlProvider } from '@lets-park/i18n';
import { WindowBanner } from './window-banner';

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

  it('is announced politely, as a status rather than an alert', () => {
    renderBanner({ state: 'OPEN' });

    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
