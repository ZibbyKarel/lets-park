import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createApiClient } from '@lets-park/api-client';
import { ERROR_DEFINITIONS } from '@lets-park/contract';
import type { AdminUser, ErrorCode } from '@lets-park/contract';
import { csMessages, IntlProvider } from '@lets-park/i18n';
import { AdminUsersScreen, matchesUserSearch } from './admin-users-screen';
import type { AdminUsersScreenProps } from './admin-users-screen';

const TIMESTAMP = '2026-08-28T09:15:00.000Z';

function aUser(overrides: Partial<AdminUser> & { id: string; name: string }): AdminUser {
  return {
    email: `${overrides.id}@firma.cz`,
    licensePlate: null,
    role: 'USER',
    oktaId: `okta|${overrides.id}`,
    active: true,
    preferredParkingSpotId: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

const ADELA = aUser({ id: 'a', name: 'Adéla Horáková', email: 'adela.horakova@firma.cz' });
const KAREL = aUser({
  id: 'k',
  name: 'Karel Zíbar',
  email: 'karel.zibar@firma.cz',
  role: 'ADMIN',
});
const PETR = aUser({
  id: 'p',
  name: 'Petr Novák',
  email: 'petr.novak@firma.cz',
  active: false,
});

/**
 * A real `RPCLink` failure — a client built with `createApiClient`, one real
 * procedure called on it, only `fetch` replaced. Same construction, and the
 * same reason, as `settings-screen.spec.tsx`: `apps/web` may not import
 * `@orpc/client` to hand-build an `ORPCError`, and one built here would assert
 * this file's idea of the wire shape rather than the transport's.
 */
async function failureWithCode(code: ErrorCode): Promise<unknown> {
  // The status the contract assigns the code. `RPCLink` derives a different
  // code from the status when it cannot read the body, so the pair has to
  // agree or the test silently exercises the wrong error.
  const status = ERROR_DEFINITIONS[code].status;
  const body = {
    json: { defined: false as const, code, status, message: 'developer-facing' },
    meta: [],
  };
  const client = createApiClient({
    url: 'https://api.test/rpc',
    fetch: async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  });

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

function renderScreen(overrides: Partial<AdminUsersScreenProps> = {}) {
  const onRetry = jest.fn();
  const onRoleChange = jest.fn();
  const onActiveChange = jest.fn();

  const props: AdminUsersScreenProps = {
    isPending: false,
    isError: false,
    error: null,
    onRetry,
    users: [ADELA, KAREL, PETR],
    viewerId: KAREL.id,
    onRoleChange,
    onActiveChange,
    pendingChange: null,
    updateError: null,
    ...overrides,
  };

  render(
    <IntlProvider>
      <AdminUsersScreen {...props} />
    </IntlProvider>
  );

  return { onRetry, onRoleChange, onActiveChange, user: userEvent.setup() };
}

/** The `<tr>` for one user, found by the `data-row-id` `DataTable` writes. */
function rowOf(user: AdminUser): HTMLElement {
  const row = document.querySelector(`[data-row-id="${user.id}"]`);
  if (!(row instanceof HTMLElement)) {
    throw new Error(`no row rendered for ${user.name}`);
  }
  return row;
}

describe('matchesUserSearch', () => {
  it('matches a substring of the name, ignoring case and diacritics-as-typed', () => {
    expect(matchesUserSearch(ADELA, 'horák')).toBe(true);
    expect(matchesUserSearch(ADELA, 'HORÁK')).toBe(true);
    expect(matchesUserSearch(ADELA, 'zíbar')).toBe(false);
  });

  it('matches a substring of the email', () => {
    expect(matchesUserSearch(KAREL, 'karel.zibar@')).toBe(true);
    expect(matchesUserSearch(KAREL, 'novak')).toBe(false);
  });

  it('matches everything on an empty or whitespace-only term', () => {
    expect(matchesUserSearch(PETR, '')).toBe(true);
    expect(matchesUserSearch(PETR, '   ')).toBe(true);
  });
});

describe('AdminUsersScreen', () => {
  it('waits rather than showing an empty table while the list is in flight', () => {
    renderScreen({ isPending: true, users: undefined });

    expect(screen.getByRole('status')).toHaveTextContent('Načítá se…');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('offers a retry when the list could not be loaded', async () => {
    const { onRetry, user } = renderScreen({
      isError: true,
      users: undefined,
      error: new Error('connection refused'),
    });

    expect(screen.queryByText(/connection refused/u)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zkusit znovu' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('lists every account with its name and e-mail', () => {
    renderScreen();

    expect(within(rowOf(ADELA)).getByText('Adéla Horáková')).toBeInTheDocument();
    expect(within(rowOf(ADELA)).getByText('adela.horakova@firma.cz')).toBeInTheDocument();
    expect(within(rowOf(PETR)).getByText('Petr Novák')).toBeInTheDocument();
  });

  it('counts the accounts in the Czech plural the design uses', () => {
    renderScreen();

    expect(
      screen.getByText('3 účty ze SSO · admin roli lze kdykoliv přidat i odebrat')
    ).toBeInTheDocument();
  });

  it('declines the count for one and for many', () => {
    renderScreen({ users: [KAREL] });
    expect(screen.getByText(/^1 účet ze SSO/u)).toBeInTheDocument();
  });

  it('shows the admin switch on and off according to the role', () => {
    renderScreen();

    expect(
      within(rowOf(KAREL)).getByRole('switch', { name: 'Admin role — Karel Zíbar' })
    ).toBeChecked();
    expect(
      within(rowOf(ADELA)).getByRole('switch', { name: 'Admin role — Adéla Horáková' })
    ).not.toBeChecked();
  });

  it('reports a promotion and a demotion as the role the switch moved to', async () => {
    const { onRoleChange, user } = renderScreen();

    await user.click(
      within(rowOf(ADELA)).getByRole('switch', { name: 'Admin role — Adéla Horáková' })
    );
    expect(onRoleChange).toHaveBeenLastCalledWith(ADELA.id, true);

    await user.click(
      within(rowOf(KAREL)).getByRole('switch', { name: 'Admin role — Karel Zíbar' })
    );
    expect(onRoleChange).toHaveBeenLastCalledWith(KAREL.id, false);
  });

  it('shows the active switch on and off according to the account', () => {
    renderScreen();

    expect(
      within(rowOf(ADELA)).getByRole('switch', { name: 'Aktivní účet — Adéla Horáková' })
    ).toBeChecked();
    expect(
      within(rowOf(PETR)).getByRole('switch', { name: 'Aktivní účet — Petr Novák' })
    ).not.toBeChecked();
  });

  it('deactivates and reactivates through the same switch', async () => {
    const { onActiveChange, user } = renderScreen();

    await user.click(
      within(rowOf(ADELA)).getByRole('switch', { name: 'Aktivní účet — Adéla Horáková' })
    );
    expect(onActiveChange).toHaveBeenLastCalledWith(ADELA.id, false);

    await user.click(
      within(rowOf(PETR)).getByRole('switch', { name: 'Aktivní účet — Petr Novák' })
    );
    expect(onActiveChange).toHaveBeenLastCalledWith(PETR.id, true);
  });

  describe('an admin cannot switch off their own account', () => {
    it('disables the active switch on the viewer’s own row', () => {
      renderScreen({ viewerId: KAREL.id });

      expect(
        within(rowOf(KAREL)).getByRole('switch', { name: 'Aktivní účet — Karel Zíbar' })
      ).toBeDisabled();
    });

    it('reports nothing when that switch is pressed', async () => {
      const { onActiveChange, user } = renderScreen({ viewerId: KAREL.id });

      await user.click(
        within(rowOf(KAREL)).getByRole('switch', { name: 'Aktivní účet — Karel Zíbar' })
      );

      expect(onActiveChange).not.toHaveBeenCalled();
    });

    it('leaves everybody else’s switch alone', () => {
      renderScreen({ viewerId: KAREL.id });

      expect(
        within(rowOf(ADELA)).getByRole('switch', { name: 'Aktivní účet — Adéla Horáková' })
      ).toBeEnabled();
    });

    it('still lets an admin step down from their own role', () => {
      // Demoting yourself is allowed while another admin remains — the API
      // decides that, and the UI must not pre-empt it.
      renderScreen({ viewerId: KAREL.id });

      expect(
        within(rowOf(KAREL)).getByRole('switch', { name: 'Admin role — Karel Zíbar' })
      ).toBeEnabled();
    });

    it('disables nothing when the viewer is not known yet', () => {
      renderScreen({ viewerId: undefined });

      expect(
        within(rowOf(KAREL)).getByRole('switch', { name: 'Aktivní účet — Karel Zíbar' })
      ).toBeEnabled();
    });
  });

  describe('a write in flight', () => {
    it('freezes both switches on the row being written', () => {
      renderScreen({ pendingChange: { id: ADELA.id, field: 'role' } });

      expect(
        within(rowOf(ADELA)).getByRole('switch', { name: 'Admin role — Adéla Horáková' })
      ).toBeDisabled();
      // The other field of the same row too: both go through one procedure,
      // and a second call would race the first.
      expect(
        within(rowOf(ADELA)).getByRole('switch', { name: 'Aktivní účet — Adéla Horáková' })
      ).toBeDisabled();
    });

    it('leaves the other rows usable', () => {
      renderScreen({ pendingChange: { id: ADELA.id, field: 'role' } });

      expect(
        within(rowOf(PETR)).getByRole('switch', { name: 'Admin role — Petr Novák' })
      ).toBeEnabled();
    });
  });

  describe('search', () => {
    it('filters by name', async () => {
      const { user } = renderScreen();

      await user.type(screen.getByRole('searchbox', { name: 'Hledat uživatele' }), 'novák');

      expect(screen.getByText('Petr Novák')).toBeInTheDocument();
      expect(screen.queryByText('Adéla Horáková')).not.toBeInTheDocument();
    });

    it('filters by e-mail', async () => {
      const { user } = renderScreen();

      await user.type(screen.getByRole('searchbox', { name: 'Hledat uživatele' }), 'karel.zibar@');

      expect(screen.getByText('Karel Zíbar')).toBeInTheDocument();
      expect(screen.queryByText('Petr Novák')).not.toBeInTheDocument();
    });

    it('keeps the total in the description, not the filtered count', async () => {
      const { user } = renderScreen();

      await user.type(screen.getByRole('searchbox', { name: 'Hledat uživatele' }), 'novák');

      expect(screen.getByText(/^3 účty ze SSO/u)).toBeInTheDocument();
    });

    it('says the search found nothing, not that there are no accounts', async () => {
      const { user } = renderScreen();

      await user.type(screen.getByRole('searchbox', { name: 'Hledat uživatele' }), 'zzz');

      expect(screen.getByText('Hledání nic nenašlo')).toBeInTheDocument();
      expect(screen.getByText('Zkuste jiné jméno nebo e-mail.')).toBeInTheDocument();
      expect(screen.queryByText('Žádní uživatelé')).not.toBeInTheDocument();
    });

    it('says there are no accounts when the list itself is empty', () => {
      renderScreen({ users: [] });

      expect(screen.getByText('Žádní uživatelé')).toBeInTheDocument();
    });
  });

  describe('a refused change', () => {
    it('explains a CONFLICT as the last-admin rule, not as a lost race', async () => {
      renderScreen({ updateError: await failureWithCode('CONFLICT') });

      expect(
        screen.getByText('Poslední aktivní administrátor nemůže přijít o roli ani být deaktivován.')
      ).toBeInTheDocument();
      // The `errors` namespace's generic CONFLICT sentence explains nothing
      // here, and this screen must not reach for it.
      expect(screen.queryByText(csMessages.errors.CONFLICT)).not.toBeInTheDocument();
    });

    it('never shows the reservation wording for VALIDATION_FAILED', async () => {
      renderScreen({ updateError: await failureWithCode('VALIDATION_FAILED') });

      expect(
        screen.getByText('Tuto změnu role ani aktivity účtu nelze provést.')
      ).toBeInTheDocument();
      expect(screen.queryByText(csMessages.errors.VALIDATION_FAILED)).not.toBeInTheDocument();
    });

    it('keeps the table on screen — the failure is a notice, not a screen state', async () => {
      renderScreen({ updateError: await failureWithCode('CONFLICT') });

      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByText('Adéla Horáková')).toBeInTheDocument();
    });

    it('shows nothing at all when the last change succeeded', () => {
      renderScreen({ updateError: null });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
