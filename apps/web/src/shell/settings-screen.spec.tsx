import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createApiClient } from '@lets-park/api-client';
import { IntlProvider } from '@lets-park/i18n';
import type { MyProfile, ParkingSpot } from '@lets-park/contract';
import { SettingsScreen } from './settings-screen';
import type { SettingsScreenProps } from './settings-screen';

/**
 * Every failure under test is produced by a **real** `RPCLink` — a client
 * built with `createApiClient`, one real procedure called on it, only `fetch`
 * replaced — exactly as `screen-state.spec.tsx` does, and for the same reason:
 * a hand-built `ORPCError` would assert this file's idea of the wire shape
 * instead of the transport's, and `apps/web` may not import `@orpc/client` at
 * all to build one directly.
 */
const API_URL = 'https://api.test/rpc';

function transportAnswering(status: number, body: unknown) {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
}

function rpcPayload(value: unknown) {
  return { json: value, meta: [] };
}

function contractErrorBody(code: string, status: number, message: string) {
  return { defined: false as const, code, status, message };
}

async function failureFrom(fetchImpl: () => Promise<Response>): Promise<unknown> {
  const client = createApiClient({ url: API_URL, fetch: fetchImpl });
  const marker = Symbol('resolved');
  const outcome = await client.me.get().then(
    () => marker,
    (error: unknown) => error
  );
  if (outcome === marker) {
    throw new Error('expected the call to reject, but it resolved');
  }
  return outcome;
}

const API_ORIGIN = 'https://api.test';

const PROFILE: MyProfile = {
  id: 'user-1',
  email: 'jana.novakova@example.com',
  name: 'Jana Nováková',
  licensePlate: '4AB 1234',
  role: 'USER',
  oktaId: 'okta|1',
  active: true,
  icsToken: 'ics-token-abc',
  preferredParkingSpotId: 'spot-1',
  createdAt: '2026-08-28T09:15:00.000Z',
  updatedAt: '2026-08-28T09:15:00.000Z',
};

const SPOT_A: ParkingSpot = {
  id: 'spot-1',
  label: 'E2.92',
  group: 'IT',
  active: true,
  createdAt: '2026-08-28T09:15:00.000Z',
  updatedAt: '2026-08-28T09:15:00.000Z',
};

const SPOT_B: ParkingSpot = { ...SPOT_A, id: 'spot-2', label: 'E2.65', group: 'SHARED' };

function renderScreen(overrides: Partial<SettingsScreenProps> = {}) {
  const onRetry = jest.fn();
  const onSave = jest.fn();
  const onRegenerateToken = jest.fn().mockResolvedValue(undefined);
  const onClose = jest.fn();

  const props: SettingsScreenProps = {
    isPending: false,
    isError: false,
    error: null,
    onRetry,
    profile: PROFILE,
    spots: [SPOT_A, SPOT_B],
    onSave,
    isSaving: false,
    saveError: null,
    apiOrigin: API_ORIGIN,
    icsToken: PROFILE.icsToken,
    onRegenerateToken,
    isRegenerating: false,
    regenerateError: null,
    onClose,
    ...overrides,
  };

  const view = render(
    <IntlProvider>
      <SettingsScreen {...props} />
    </IntlProvider>
  );

  function rerenderWith(next: Partial<SettingsScreenProps>) {
    view.rerender(
      <IntlProvider>
        <SettingsScreen {...{ ...props, ...next }} />
      </IntlProvider>
    );
  }

  return { onRetry, onSave, onRegenerateToken, onClose, user: userEvent.setup(), rerenderWith };
}

function stubClipboard(): { writeText: jest.Mock } {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  return { writeText };
}

describe('SettingsScreen — loading and error', () => {
  it('shows the loading state and no form while the profile is in flight', () => {
    renderScreen({ isPending: true, profile: undefined });

    expect(screen.getByRole('status')).toHaveTextContent('Načítá se…');
    expect(screen.queryByLabelText('SPZ auta')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Uložit' })).not.toBeInTheDocument();
  });

  it('shows the error state with a retry, and no form', async () => {
    const { onRetry, user } = renderScreen({
      isError: true,
      error: new Error('boom'),
      profile: undefined,
    });

    expect(screen.getByText('Něco se nepovedlo')).toBeInTheDocument();
    expect(screen.queryByLabelText('SPZ auta')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Zkusit znovu' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('hides the form when isError is set, even if a stale profile is still present', () => {
    // Deliberately an unlikely combination — the point is that "ready" reads
    // `isError` for itself rather than relying on `profile` happening to be
    // `undefined` whenever `isError` is `true`.
    renderScreen({ isError: true, error: new Error('boom'), profile: PROFILE });

    expect(screen.queryByLabelText('SPZ auta')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Uložit' })).not.toBeInTheDocument();
  });
});

describe('SettingsScreen — the form', () => {
  it('pre-fills the licence plate and the preferred spot from the profile', () => {
    renderScreen();

    expect(screen.getByLabelText('SPZ auta')).toHaveValue('4AB 1234');
    expect(screen.getByLabelText('Preferované parkovací místo')).toHaveValue('spot-1');
  });

  it('lists active spots as "label · group", plus a no-preference option', () => {
    renderScreen();

    const select = screen.getByLabelText('Preferované parkovací místo') as HTMLSelectElement;
    const optionTexts = Array.from(select.options).map((option) => option.textContent);

    expect(optionTexts).toEqual(['Bez preference', 'E2.92 · IT', 'E2.65 · SHARED']);
  });

  it('sends the trimmed licence plate and the selected spot on save', async () => {
    const { onSave, user } = renderScreen();

    await user.clear(screen.getByLabelText('SPZ auta'));
    await user.type(screen.getByLabelText('SPZ auta'), '  9ZZ 8888  ');
    await user.selectOptions(screen.getByLabelText('Preferované parkovací místo'), 'spot-2');
    await user.click(screen.getByRole('button', { name: 'Uložit' }));

    expect(onSave).toHaveBeenCalledWith({
      licensePlate: '9ZZ 8888',
      preferredParkingSpotId: 'spot-2',
    });
  });

  it('sends null for an emptied licence plate — clearing it, not an empty string', async () => {
    const { onSave, user } = renderScreen();

    await user.clear(screen.getByLabelText('SPZ auta'));
    await user.click(screen.getByRole('button', { name: 'Uložit' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ licensePlate: null }));
  });

  it('sends null for the preferred spot when "Bez preference" is chosen', async () => {
    const { onSave, user } = renderScreen();

    await user.selectOptions(screen.getByLabelText('Preferované parkovací místo'), '');
    await user.click(screen.getByRole('button', { name: 'Uložit' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ preferredParkingSpotId: null }));
  });

  it('cancels without saving', async () => {
    const { onSave, onClose, user } = renderScreen();

    await user.click(screen.getByRole('button', { name: 'Zrušit' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('disables Cancel and shows a spinner on Save while saving', () => {
    renderScreen({ isSaving: true });

    expect(screen.getByRole('button', { name: 'Zrušit' })).toBeDisabled();
    expect(screen.getByTestId('button-spinner')).toBeInTheDocument();
  });

  it('shows no error toast when there is nothing to report', () => {
    renderScreen();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a translated message when saving fails', async () => {
    const error = await failureFrom(
      transportAnswering(400, rpcPayload(contractErrorBody('VALIDATION_FAILED', 400, 'nope')))
    );

    renderScreen({ saveError: error });

    expect(
      screen.getByText('Požadavek porušuje pravidlo rezervací (např. víkend nebo svátek).')
    ).toBeInTheDocument();
  });

  it('does not clobber an in-progress edit when the profile silently refetches', async () => {
    const { user, rerenderWith } = renderScreen();

    await user.clear(screen.getByLabelText('SPZ auta'));
    await user.type(screen.getByLabelText('SPZ auta'), '1XY 9999');

    // A background refetch (e.g. `me.get` invalidated after the ICS token
    // regenerates) hands down a new profile object — same person, new
    // reference. It must not silently overwrite what the user is mid-typing.
    rerenderWith({ profile: { ...PROFILE, icsToken: 'a-different-token' } });

    expect(screen.getByLabelText('SPZ auta')).toHaveValue('1XY 9999');
  });
});

describe('SettingsScreen — the ICS section', () => {
  it('shows the unavailable message when the API origin is unknown', () => {
    renderScreen({ apiOrigin: '' });

    expect(
      screen.getByText('Odkaz na kalendář teď není k dispozici. Zkuste to prosím znovu za chvíli.')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Odkaz na kalendář')).not.toBeInTheDocument();
  });

  it('shows the unavailable message when there is no token yet', () => {
    renderScreen({ icsToken: undefined });

    expect(screen.queryByLabelText('Odkaz na kalendář')).not.toBeInTheDocument();
  });

  it('builds the feed URL from the origin and the token', () => {
    renderScreen({ apiOrigin: API_ORIGIN, icsToken: 'abc' });

    expect(screen.getByLabelText('Odkaz na kalendář')).toHaveValue(
      'https://api.test/api/calendar/abc.ics'
    );
  });

  it('copies the feed URL and shows confirmation', async () => {
    const { user } = renderScreen();
    // Stubbed *after* `renderScreen` — `userEvent.setup()` installs its own
    // clipboard polyfill the moment it runs, which would otherwise clobber a
    // stub defined any earlier.
    const { writeText } = stubClipboard();

    await user.click(screen.getByRole('button', { name: 'Kopírovat odkaz' }));

    expect(writeText).toHaveBeenCalledWith('https://api.test/api/calendar/ics-token-abc.ics');
    expect(await screen.findByText('Odkaz zkopírován do schránky.')).toBeInTheDocument();
  });

  it('shows a failure message when the clipboard write rejects', async () => {
    const { user } = renderScreen();
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText: jest.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });

    await user.click(screen.getByRole('button', { name: 'Kopírovat odkaz' }));

    expect(
      await screen.findByText('Kopírování se nezdařilo — zkopírujte odkaz ručně.')
    ).toBeInTheDocument();
  });

  it('disables the regenerate trigger while a regeneration is already in flight', () => {
    renderScreen({ isRegenerating: true });

    expect(screen.getByRole('button', { name: 'Vygenerovat nový odkaz' })).toBeDisabled();
  });

  it('opens a confirmation before regenerating the token', async () => {
    const { user } = renderScreen();

    expect(screen.queryByText('Vygenerovat nový odkaz?')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Vygenerovat nový odkaz' }));

    expect(screen.getByRole('dialog', { name: 'Vygenerovat nový odkaz?' })).toBeInTheDocument();
  });

  it('cancels the confirmation without calling back', async () => {
    const { onRegenerateToken, user } = renderScreen();

    await user.click(screen.getByRole('button', { name: 'Vygenerovat nový odkaz' }));
    const dialog = screen.getByRole('dialog', { name: 'Vygenerovat nový odkaz?' });
    await user.click(within(dialog).getByRole('button', { name: 'Zrušit' }));

    expect(onRegenerateToken).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('dialog', { name: 'Vygenerovat nový odkaz?' })
    ).not.toBeInTheDocument();
  });

  it('regenerates the token and closes the dialog on success', async () => {
    const { onRegenerateToken, user } = renderScreen();

    await user.click(screen.getByRole('button', { name: 'Vygenerovat nový odkaz' }));
    const dialog = screen.getByRole('dialog', { name: 'Vygenerovat nový odkaz?' });
    await user.click(within(dialog).getByRole('button', { name: 'Vygenerovat' }));

    expect(onRegenerateToken).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Vygenerovat nový odkaz?' })
      ).not.toBeInTheDocument()
    );
  });

  it('keeps the confirmation open when regeneration rejects, so the user can retry', async () => {
    const onRegenerateToken = jest.fn().mockRejectedValue(new Error('boom'));
    const { user } = renderScreen({ onRegenerateToken });

    await user.click(screen.getByRole('button', { name: 'Vygenerovat nový odkaz' }));
    const dialog = screen.getByRole('dialog', { name: 'Vygenerovat nový odkaz?' });
    await user.click(within(dialog).getByRole('button', { name: 'Vygenerovat' }));

    await waitFor(() => expect(onRegenerateToken).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('dialog', { name: 'Vygenerovat nový odkaz?' })).toBeInTheDocument();
  });

  it('shows a translated message inside the dialog when a previous regeneration failed', async () => {
    const error = await failureFrom(
      transportAnswering(403, rpcPayload(contractErrorBody('FORBIDDEN', 403, 'nope')))
    );
    const { user } = renderScreen({ regenerateError: error });

    await user.click(screen.getByRole('button', { name: 'Vygenerovat nový odkaz' }));
    const dialog = screen.getByRole('dialog', { name: 'Vygenerovat nový odkaz?' });

    expect(within(dialog).getByText('K této akci nemáte oprávnění.')).toBeInTheDocument();
  });

  it('shows the confirm button as loading once a regeneration is in flight', async () => {
    const { user, rerenderWith } = renderScreen();

    await user.click(screen.getByRole('button', { name: 'Vygenerovat nový odkaz' }));
    rerenderWith({ isRegenerating: true });

    const dialog = screen.getByRole('dialog', { name: 'Vygenerovat nový odkaz?' });
    expect(within(dialog).getByTestId('button-spinner')).toBeInTheDocument();
  });
});
