import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from '@lets-park/i18n';
import type { UserRole } from '@lets-park/contract';
import { AdminScreen } from './admin-screen';

/**
 * The real `IntlProvider`, because the Czech sentence a non-admin is shown is
 * half of what is under test — the other half being which of the four states
 * is chosen. Nothing is fetched here: that is the point of the split, and the
 * page's own wiring is exercised in the browser.
 */
function renderAdminScreen(
  overrides: {
    role?: UserRole | undefined;
    isPending?: boolean;
    isError?: boolean;
    error?: unknown;
  } = {}
) {
  const onRetry = jest.fn();

  render(
    <IntlProvider>
      <AdminScreen
        role={overrides.role}
        isPending={overrides.isPending ?? false}
        isError={overrides.isError ?? false}
        error={overrides.error ?? null}
        onRetry={onRetry}
      />
    </IntlProvider>
  );

  return { onRetry, user: userEvent.setup() };
}

describe('AdminScreen', () => {
  it('shows the administration section to an admin', () => {
    renderAdminScreen({ role: 'ADMIN' });

    expect(screen.getByRole('heading', { name: 'Správa' })).toBeInTheDocument();
    expect(screen.queryByText('K této akci nemáte oprávnění.')).not.toBeInTheDocument();
  });

  it('refuses a plain user, and does not render the section', () => {
    renderAdminScreen({ role: 'USER' });

    expect(screen.getByText('K této akci nemáte oprávnění.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Správa' })).not.toBeInTheDocument();
    expect(screen.queryByText('Tato část se právě připravuje.')).not.toBeInTheDocument();
  });

  it('fails closed when the role is not known', () => {
    // Neither pending nor failed, yet no role — the state a profile without one
    // would produce. Unknown is not an admin.
    renderAdminScreen({ role: undefined });

    expect(screen.getByText('K této akci nemáte oprávnění.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Správa' })).not.toBeInTheDocument();
  });

  it('waits rather than deciding while the profile is in flight', () => {
    renderAdminScreen({ role: undefined, isPending: true });

    expect(screen.getByRole('status')).toHaveTextContent('Načítá se…');
    expect(screen.queryByText('K této akci nemáte oprávnění.')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Správa' })).not.toBeInTheDocument();
  });

  it('offers a retry when the profile could not be loaded', async () => {
    const { onRetry, user } = renderAdminScreen({
      isError: true,
      error: new Error('connection refused'),
    });

    expect(screen.queryByRole('heading', { name: 'Správa' })).not.toBeInTheDocument();
    // The thrown error's own message is never shown; see `ScreenError`.
    expect(screen.queryByText(/connection refused/u)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Zkusit znovu' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
