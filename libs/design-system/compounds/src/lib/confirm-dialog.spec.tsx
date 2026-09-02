import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ConfirmDialog } from './confirm-dialog';

function renderDialog(props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();

  render(
    <ConfirmDialog
      open
      title="Opravdu smazat?"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />
  );

  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('renders nothing while closed', () => {
    renderDialog({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('names the dialog with the title and describes it with the description', () => {
    renderDialog({ description: 'Tuto akci nelze vrátit zpět.' });

    const dialog = screen.getByRole('dialog', { name: 'Opravdu smazat?' });

    expect(dialog).toHaveAccessibleDescription('Tuto akci nelze vrátit zpět.');
  });

  it('defaults the two button labels to the generic Czech verbs', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Potvrdit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zrušit' })).toBeInTheDocument();
  });

  it('uses the supplied labels instead', () => {
    renderDialog({ confirmLabel: 'Smazat', cancelLabel: 'Ponechat' });

    expect(screen.getByRole('button', { name: 'Smazat' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ponechat' })).toBeInTheDocument();
  });

  it('calls onConfirm only from the confirming button', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Potvrdit' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel from the cancel button', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Zrušit' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onCancel from Escape', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog();

    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel from the × button', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Zavřít' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not open with the confirming button focused', () => {
    renderDialog({ tone: 'danger', confirmLabel: 'Smazat' });

    expect(screen.getByRole('button', { name: 'Smazat' })).not.toHaveFocus();
  });

  describe('while loading', () => {
    it('marks the confirming button busy and disables both buttons', () => {
      renderDialog({ loading: true });

      expect(screen.getByRole('button', { name: 'Potvrdit' })).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByRole('button', { name: 'Potvrdit' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Zrušit' })).toBeDisabled();
    });

    it('ignores Escape', async () => {
      const user = userEvent.setup();
      const { onCancel } = renderDialog({ loading: true });

      await user.keyboard('{Escape}');

      expect(onCancel).not.toHaveBeenCalled();
    });

    it('ignores the × button', async () => {
      const user = userEvent.setup();
      const { onCancel } = renderDialog({ loading: true });

      await user.click(screen.getByRole('button', { name: 'Zavřít' }));

      expect(onCancel).not.toHaveBeenCalled();
    });
  });
});
