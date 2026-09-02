import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Button } from './button';
import { Input } from './input';
import { Modal } from './modal';

/**
 * A realistic host: a trigger in the page, and a modal with two controls in it.
 * Focus return and "Tab never reaches the page behind" are only meaningful
 * against a page that has something to return to and something to escape into.
 */
function Host({ closeOnScrimClick = true }: { closeOnScrimClick?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Otevřít
      </button>
      <button type="button">Jiné tlačítko v pozadí</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        closeOnScrimClick={closeOnScrimClick}
        title="Nastavení"
        description="Popis dialogu."
        footer={<Button onClick={() => setOpen(false)}>Uložit</Button>}
      >
        <Input label="Jméno" />
      </Modal>
    </div>
  );
}

describe('Modal', () => {
  it('renders nothing while closed', () => {
    render(<Host />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is a modal dialog named by its own title', async () => {
    const user = userEvent.setup();
    render(<Host />);

    await user.click(screen.getByRole('button', { name: 'Otevřít' }));

    const dialog = screen.getByRole('dialog', { name: 'Nastavení' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Popis dialogu.');
  });

  it('moves focus into the dialog when it opens', async () => {
    const user = userEvent.setup();
    render(<Host />);

    await user.click(screen.getByRole('button', { name: 'Otevřít' }));

    expect(screen.getByRole('dialog')).toContainElement(
      document.activeElement as HTMLElement | null
    );
  });

  it('cycles Tab inside the dialog and never reaches the page behind', async () => {
    const user = userEvent.setup();
    render(<Host />);

    await user.click(screen.getByRole('button', { name: 'Otevřít' }));

    const closeButton = screen.getByRole('button', { name: 'Zavřít' });
    const input = screen.getByLabelText('Jméno');
    const save = screen.getByRole('button', { name: 'Uložit' });
    const behind = screen.getByRole('button', { name: 'Jiné tlačítko v pozadí' });

    expect(closeButton).toHaveFocus();

    await user.tab();
    expect(input).toHaveFocus();

    await user.tab();
    expect(save).toHaveFocus();

    // The wrap: from the last control back to the first, not out to the page.
    await user.tab();
    expect(closeButton).toHaveFocus();
    expect(behind).not.toHaveFocus();

    // ...and around the loop several more times, to prove the wrap is not a
    // one-off that happens to land right on the first pass.
    await user.tab();
    await user.tab();
    await user.tab();
    expect(closeButton).toHaveFocus();
  });

  it('cycles Shift+Tab backwards inside the dialog', async () => {
    const user = userEvent.setup();
    render(<Host />);

    await user.click(screen.getByRole('button', { name: 'Otevřít' }));

    const closeButton = screen.getByRole('button', { name: 'Zavřít' });
    const save = screen.getByRole('button', { name: 'Uložit' });
    const input = screen.getByLabelText('Jméno');

    expect(closeButton).toHaveFocus();

    // Backwards from the first control wraps to the last.
    await user.tab({ shift: true });
    expect(save).toHaveFocus();

    await user.tab({ shift: true });
    expect(input).toHaveFocus();

    await user.tab({ shift: true });
    expect(closeButton).toHaveFocus();
  });

  it('pulls focus back in if it somehow lands outside the dialog', async () => {
    const user = userEvent.setup();
    render(<Host />);

    await user.click(screen.getByRole('button', { name: 'Otevřít' }));

    // Simulates a stray .focus() call from unrelated code landing in the page
    // behind. Shift+Tab specifically: the portal appends the dialog at the end
    // of <body>, so a *forward* Tab from here would wander into the dialog on
    // its own and prove nothing — backwards is the direction that escapes.
    screen.getByRole('button', { name: 'Jiné tlačítko v pozadí' }).focus();

    await user.tab({ shift: true });

    expect(screen.getByRole('button', { name: 'Otevřít' })).not.toHaveFocus();
    expect(screen.getByRole('dialog')).toContainElement(
      document.activeElement as HTMLElement | null
    );
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<Host />);

    await user.click(screen.getByRole('button', { name: 'Otevřít' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('returns focus to the element that opened it', async () => {
    const user = userEvent.setup();
    render(<Host />);

    const trigger = screen.getByRole('button', { name: 'Otevřít' });
    await user.click(trigger);
    expect(trigger).not.toHaveFocus();

    await user.keyboard('{Escape}');

    expect(trigger).toHaveFocus();
  });

  it('returns focus to the trigger after closing with the close button too', async () => {
    const user = userEvent.setup();
    render(<Host />);

    const trigger = screen.getByRole('button', { name: 'Otevřít' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Zavřít' }));

    expect(trigger).toHaveFocus();
  });

  it('closes when the scrim is clicked, but not when the dialog itself is', async () => {
    const user = userEvent.setup();
    render(<Host />);

    await user.click(screen.getByRole('button', { name: 'Otevřít' }));

    await user.click(screen.getByRole('dialog'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // The scrim is the dialog's parent element.
    const scrim = screen.getByRole('dialog').parentElement as HTMLElement;
    await user.click(scrim);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ignores scrim clicks when closeOnScrimClick is false, but still closes on Escape', async () => {
    const user = userEvent.setup();
    render(<Host closeOnScrimClick={false} />);

    await user.click(screen.getByRole('button', { name: 'Otevřít' }));

    const scrim = screen.getByRole('dialog').parentElement as HTMLElement;
    await user.click(scrim);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('locks the page behind from scrolling while open, and unlocks on close', async () => {
    const user = userEvent.setup();
    render(<Host />);

    expect(document.body.style.overflow).toBe('');

    await user.click(screen.getByRole('button', { name: 'Otevřít' }));
    expect(document.body.style.overflow).toBe('hidden');

    await user.keyboard('{Escape}');
    expect(document.body.style.overflow).toBe('');
  });

  it('takes focus itself when it contains no controls at all', async () => {
    const user = userEvent.setup();

    function Bare() {
      const [open, setOpen] = useState(false);

      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Otevřít
          </button>
          <Modal open={open} onClose={() => setOpen(false)} title="Jen text" hideCloseButton>
            Nic k ovládání.
          </Modal>
        </div>
      );
    }

    render(<Bare />);
    await user.click(screen.getByRole('button', { name: 'Otevřít' }));

    expect(screen.getByRole('dialog')).toHaveFocus();

    // Tab must not walk out of a dialog that has nothing to walk to.
    await user.tab();
    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('renders into document.body rather than in place, so no ancestor can clip or stack it', async () => {
    const user = userEvent.setup();
    const { container } = render(<Host />);

    await user.click(screen.getByRole('button', { name: 'Otevřít' }));

    expect(container).not.toContainElement(screen.getByRole('dialog'));
    expect(document.body).toContainElement(screen.getByRole('dialog'));
  });

  it('shows the eyebrow and footer when given them', async () => {
    const user = userEvent.setup();

    function WithEyebrow() {
      const [open, setOpen] = useState(true);

      return (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Detail"
          eyebrow="Otevřeno"
          footer={<Button>Potvrdit</Button>}
        />
      );
    }

    render(<WithEyebrow />);

    expect(screen.getByText('Otevřeno')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Potvrdit' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
  });
});
