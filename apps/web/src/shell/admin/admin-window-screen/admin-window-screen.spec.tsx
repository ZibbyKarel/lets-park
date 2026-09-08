import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MonthWindowOverview, ReservationLockMode } from '@lets-park/contract';
import { csMessages, IntlProvider } from '@lets-park/i18n';
import { failureWithCode } from '../../../testing/contract-failure';
import { AdminWindowScreen, BADGE_STATE_TONE } from './admin-window-screen';
import type { AdminWindowScreenProps } from './admin-window-screen';

/**
 * The screen now takes the whole `admin.window.months` payload as one
 * {@link ScreenData}, so the helper below keeps offering the three pieces the
 * tests actually vary — the two settings and the month rows — and assembles
 * the ready state from them. A test that needs the loading or the error state
 * passes `reservationWindow` itself.
 */
type WindowOverrides = Partial<Omit<AdminWindowScreenProps, 'reservationWindow'>> & {
  readonly reservationWindow?: AdminWindowScreenProps['reservationWindow'];
  readonly openDaysBefore?: number;
  readonly lockMode?: ReservationLockMode;
  readonly months?: MonthWindowOverview[];
};

/** September, named because two tests reach for it on its own. */
const SEPTEMBER: MonthWindowOverview = {
  month: '2026-09',
  windowFrom: '2026-08-25',
  windowTo: '2026-08-31',
  state: 'OPEN',
  lockMode: 'AUTO',
};

/** The four months the design lists, from a day in August 2026. */
const MONTHS: MonthWindowOverview[] = [
  {
    month: '2026-08',
    windowFrom: '2026-07-25',
    windowTo: '2026-07-31',
    state: 'LOCKED',
    lockMode: 'AUTO',
  },
  SEPTEMBER,
  {
    month: '2026-10',
    windowFrom: '2026-09-24',
    windowTo: '2026-09-30',
    state: 'NOT_YET_OPEN',
    lockMode: 'AUTO',
  },
  {
    month: '2026-11',
    windowFrom: '2026-10-25',
    windowTo: '2026-10-31',
    state: 'NOT_YET_OPEN',
    lockMode: 'AUTO',
  },
];

function renderScreen({
  openDaysBefore = 7,
  lockMode = 'AUTO',
  months = MONTHS,
  reservationWindow,
  ...overrides
}: WindowOverrides = {}) {
  const onRetry = jest.fn();
  const onChange = jest.fn();

  const props: AdminWindowScreenProps = {
    reservationWindow: reservationWindow ?? {
      kind: 'ready',
      data: { settings: { openDaysBefore, lockMode }, months },
    },
    onRetry,
    today: '2026-08-28',
    onChange,
    isSaving: false,
    saveError: null,
    isSaved: false,
    ...overrides,
  };

  render(
    <IntlProvider>
      <AdminWindowScreen {...props} />
    </IntlProvider>
  );

  return { onRetry, onChange, user: userEvent.setup() };
}

/** The `<li>` for one month, found by its heading text. */
function monthRow(name: string): HTMLElement {
  const row = screen.getByText(name).closest('li');
  if (!(row instanceof HTMLElement)) {
    throw new Error(`no row rendered for ${name}`);
  }
  return row;
}

describe('AdminWindowScreen', () => {
  describe('the settings card', () => {
    it('carries the design’s explanation verbatim', () => {
      // doc/design/screens/05-admin-window.png
      renderScreen();

      expect(
        screen.getByText(
          'Kolik dní před začátkem měsíce se otevřou rezervace na ten měsíc. Po začátku měsíce se rezervace uzamknou — upravovat je pak může jen admin, uživatel může svoji rezervaci kdykoliv zrušit.'
        )
      ).toBeInTheDocument();
    });

    it('shows the current setting declined into Czech', () => {
      renderScreen({ openDaysBefore: 7 });

      expect(screen.getByRole('spinbutton', { name: 'Otevřít X dní předem' })).toHaveAttribute(
        'aria-valuetext',
        '7 dní'
      );
    });

    it.each([
      [1, '1 den'],
      [3, '3 dny'],
      [7, '7 dní'],
      [21, '21 dní'],
    ])('declines %i as "%s"', (days, text) => {
      renderScreen({ openDaysBefore: days });

      expect(screen.getByRole('spinbutton', { name: 'Otevřít X dní předem' })).toHaveAttribute(
        'aria-valuetext',
        text
      );
    });

    it('stays inside the range the contract accepts', () => {
      renderScreen({ openDaysBefore: 7 });

      const stepper = screen.getByRole('spinbutton', { name: 'Otevřít X dní předem' });
      expect(stepper).toHaveAttribute('aria-valuemin', '1');
      expect(stepper).toHaveAttribute('aria-valuemax', '31');
    });

    it('sends both fields on a day change, because the contract replaces rather than patches', async () => {
      const { onChange, user } = renderScreen({ openDaysBefore: 7, lockMode: 'FORCE_OPEN' });

      await user.click(screen.getByRole('button', { name: 'O den více' }));

      expect(onChange).toHaveBeenCalledWith({ openDaysBefore: 8, lockMode: 'FORCE_OPEN' });
    });

    it('sends both fields on a lock-mode change too', async () => {
      const { onChange, user } = renderScreen({ openDaysBefore: 12, lockMode: 'AUTO' });

      await user.click(screen.getByRole('radio', { name: 'Vynutit uzamčeno' }));

      expect(onChange).toHaveBeenCalledWith({ openDaysBefore: 12, lockMode: 'FORCE_LOCKED' });
    });

    it('offers the three lock modes the design draws', () => {
      renderScreen();

      expect(screen.getAllByRole('radio').map((pill) => pill.textContent)).toEqual([
        'Automaticky',
        'Vynutit otevřeno',
        'Vynutit uzamčeno',
      ]);
    });

    it('freezes both controls while a save is in flight', () => {
      renderScreen({ isSaving: true });

      expect(screen.getByRole('button', { name: 'O den více' })).toBeDisabled();
      expect(screen.getByRole('radio', { name: 'Vynutit otevřeno' })).toBeDisabled();
    });

    it('confirms a save, and stops confirming once something changes again', () => {
      renderScreen({ isSaved: true });
      expect(screen.getByText('Nastavení uloženo.')).toBeInTheDocument();
    });

    it('says nothing while nothing has been saved', () => {
      renderScreen({ isSaved: false });
      expect(screen.queryByText('Nastavení uloženo.')).not.toBeInTheDocument();
    });

    it('names the real limit for a refused day count, not the reservation rule', async () => {
      renderScreen({ saveError: await failureWithCode('VALIDATION_FAILED') });

      expect(screen.getByText('Počet dní musí být mezi 1 a 31.')).toBeInTheDocument();
      expect(screen.queryByText(csMessages.errors.VALIDATION_FAILED)).not.toBeInTheDocument();
    });

    it('does not confirm a save that failed', async () => {
      renderScreen({ isSaved: true, saveError: await failureWithCode('CONFLICT') });

      expect(screen.queryByText('Nastavení uloženo.')).not.toBeInTheDocument();
      expect(
        screen.getByText('Nastavení mezitím změnil někdo jiný. Obnovte prosím stránku.')
      ).toBeInTheDocument();
    });
  });

  describe('the month list', () => {
    it('says which day it was derived against', () => {
      renderScreen({ today: '2026-08-28' });

      expect(
        screen.getByText('Podle nastavení vlevo · dnes je 28. srpna 2026')
      ).toBeInTheDocument();
    });

    it('names every month in the nominative with its year', () => {
      renderScreen();

      for (const name of ['srpen 2026', 'září 2026', 'říjen 2026', 'listopad 2026']) {
        expect(screen.getByText(name)).toBeInTheDocument();
      }
    });

    it('prints each month’s window as the design does', () => {
      renderScreen();

      expect(
        within(monthRow('srpen 2026')).getByText('otevřeno 25. července – 31. července')
      ).toBeInTheDocument();
      expect(
        within(monthRow('září 2026')).getByText('otevřeno 25. srpna – 31. srpna')
      ).toBeInTheDocument();
    });

    it.each([
      ['srpen 2026', 'Uzamčeno'],
      ['září 2026', 'Otevřeno'],
      ['říjen 2026', 'Zatím neotevřeno'],
    ])('badges %s as %s', (month, badge) => {
      renderScreen();

      expect(within(monthRow(month)).getByText(badge)).toBeInTheDocument();
    });

    it('marks a forced month’s range as hypothetical rather than stating it', () => {
      // Under a forced lock mode `windowFrom`/`windowTo` describe what the
      // automatic rule *would* have done. Printing "otevřeno 25. srpna – 31.
      // srpna" next to an "Otevřeno" badge that an admin forced would be a
      // false statement about when booking closes.
      renderScreen({
        lockMode: 'FORCE_OPEN',
        months: [{ ...SEPTEMBER, state: 'OPEN', lockMode: 'FORCE_OPEN' }],
      });

      expect(
        screen.getByText('automaticky by bylo otevřeno 25. srpna – 31. srpna')
      ).toBeInTheDocument();
      expect(screen.queryByText('otevřeno 25. srpna – 31. srpna')).not.toBeInTheDocument();
    });
  });

  it('waits while the settings are in flight', () => {
    renderScreen({ reservationWindow: { kind: 'loading' } });

    expect(screen.getByRole('status')).toHaveTextContent('Načítá se…');
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  describe('the colour of a month badge, which is read before its label is', () => {
    /**
     * One class per tone, read off `badge.tsx`'s own `TONE_CLASSES`. Asserting
     * a class asserts an implementation detail of the primitive on purpose: the
     * tone is a colour, `05-admin-window.png` uses the colour as the signal,
     * and a class is all a jsdom test can see of one.
     */
    const TONE_CLASS = {
      success: 'bg-brand-green-100',
      warning: 'bg-brand-yellow-100',
      neutral: 'bg-bg-muted',
    } as const;

    // `Otevřeno` green, `Uzamčeno` yellow, `Zatím neotevřeno` grey.
    const DESIGN_TONE = { OPEN: 'success', LOCKED: 'warning', NOT_YET_OPEN: 'neutral' } as const;
    const LABEL = {
      OPEN: 'Otevřeno',
      LOCKED: 'Uzamčeno',
      NOT_YET_OPEN: 'Zatím neotevřeno',
    } as const;

    it('maps each state to the colour the design gives it', () => {
      expect(BADGE_STATE_TONE).toEqual(DESIGN_TONE);
    });

    it.each(['OPEN', 'LOCKED', 'NOT_YET_OPEN'] as const)('paints a %s month in it', (state) => {
      renderScreen({ months: [{ ...SEPTEMBER, state }] });

      // The expectation is the design's colour, not `BADGE_STATE_TONE[state]` —
      // reading back the map the render used would agree with any mutation of
      // it, which is exactly the survivor this replaces.
      expect(screen.getByText(LABEL[state]).className.split(/\s+/u)).toContain(
        TONE_CLASS[DESIGN_TONE[state]]
      );
    });
  });

  it('offers a retry when the settings could not be loaded', async () => {
    const { onRetry, user } = renderScreen({
      reservationWindow: { kind: 'error', error: new Error('connection refused') },
    });

    expect(screen.queryByText(/connection refused/u)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zkusit znovu' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
