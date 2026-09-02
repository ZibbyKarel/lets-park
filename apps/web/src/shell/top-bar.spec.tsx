import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from '@lets-park/i18n';
import type { UserRole } from '@lets-park/contract';
import { ADMIN_ROUTE, SETTINGS_ROUTE } from '../routes';
import { TopBar } from './top-bar';

/**
 * The real `IntlProvider` and the real `Dropdown`, not doubles: what is under
 * test is which entries the menu offers and what selecting one reports, and
 * both of those are properties of the composition rather than of this file.
 * Only the two callbacks are stubbed, because they are the seam by design.
 */
function renderTopBar(
  overrides: {
    name?: string;
    email?: string;
    role?: UserRole | undefined;
  } = {}
) {
  const onNavigate = jest.fn();
  const onSignOut = jest.fn();

  render(
    <IntlProvider>
      <TopBar
        name={overrides.name ?? 'Karel Zíbar'}
        email={overrides.email ?? 'karel.zibar@firma.cz'}
        role={overrides.role}
        onNavigate={onNavigate}
        onSignOut={onSignOut}
      />
    </IntlProvider>
  );

  return { onNavigate, onSignOut, user: userEvent.setup() };
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Uživatelské menu' }));
}

describe('TopBar', () => {
  it('shows the name and the initials next to the logo', () => {
    renderTopBar();

    expect(screen.getAllByText('Karel Zíbar').length).toBeGreaterThan(0);
    expect(screen.getByText('KZ')).toBeInTheDocument();
    expect(screen.getByText('Let’s Park')).toBeInTheDocument();
  });

  it('shows the email only inside the menu, not on the bar', async () => {
    const { user } = renderTopBar();

    expect(screen.queryByText('karel.zibar@firma.cz')).not.toBeInTheDocument();
    await openMenu(user);
    expect(screen.getByText('karel.zibar@firma.cz')).toBeInTheDocument();
  });

  describe('for a plain user', () => {
    it('renders no ADMIN badge', () => {
      renderTopBar({ role: 'USER' });
      expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    });

    it('offers only settings and sign-out', async () => {
      const { user } = renderTopBar({ role: 'USER' });
      await openMenu(user);

      expect(screen.getByRole('menuitem', { name: 'Nastavení (SPZ auta)' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Odhlásit se' })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: /Správa/ })).not.toBeInTheDocument();
    });
  });

  describe('for an administrator', () => {
    it('renders the ADMIN badge', () => {
      renderTopBar({ role: 'ADMIN' });
      expect(screen.getByText('Admin')).toBeInTheDocument();
    });

    it('offers the administration entry', async () => {
      const { user } = renderTopBar({ role: 'ADMIN' });
      await openMenu(user);

      expect(screen.getByRole('menuitem', { name: /Správa/ })).toBeInTheDocument();
    });
  });

  describe('when the role is not known yet', () => {
    // `me.get` is in flight, or it failed. Both reach this component as
    // `role === undefined`, and both have to fail closed.
    it('renders neither the badge nor the administration entry', async () => {
      const { user } = renderTopBar({ role: undefined });

      expect(screen.queryByText('Admin')).not.toBeInTheDocument();
      await openMenu(user);
      expect(screen.queryByRole('menuitem', { name: /Správa/ })).not.toBeInTheDocument();
    });
  });

  it('navigates to the settings route when settings is chosen', async () => {
    const { user, onNavigate, onSignOut } = renderTopBar({ role: 'USER' });
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Nastavení (SPZ auta)' }));

    expect(onNavigate).toHaveBeenCalledWith(SETTINGS_ROUTE);
    expect(onSignOut).not.toHaveBeenCalled();
  });

  it('navigates to the administration route when administration is chosen', async () => {
    const { user, onNavigate } = renderTopBar({ role: 'ADMIN' });
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /Správa/ }));

    expect(onNavigate).toHaveBeenCalledWith(ADMIN_ROUTE);
  });

  it('signs out when sign-out is chosen, and does not navigate', async () => {
    const { user, onNavigate, onSignOut } = renderTopBar({ role: 'USER' });
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Odhlásit se' }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('links the logo to the parking overview', () => {
    renderTopBar();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/');
  });
});
