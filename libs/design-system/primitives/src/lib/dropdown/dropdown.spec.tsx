import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Dropdown, type DropdownItem } from './dropdown';
import { Modal } from '../modal/modal';

const ITEMS: DropdownItem[] = [
  { id: 'settings', label: 'Nastavení' },
  { id: 'admin', label: 'Správa', trailing: '→' },
  { id: 'signout', label: 'Odhlásit se', danger: true },
];

function renderDropdown(props: Partial<Parameters<typeof Dropdown>[0]> = {}) {
  const onSelect = jest.fn();
  render(
    <div>
      <button type="button">Před</button>
      <Dropdown trigger="Karel Z." items={ITEMS} onSelect={onSelect} {...props} />
      <button type="button">Za</button>
    </div>
  );

  return { onSelect };
}

describe('Dropdown', () => {
  it('announces itself as a closed menu button', () => {
    renderDropdown();

    const trigger = screen.getByRole('button', { name: 'Karel Z.' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens on click and marks itself expanded', async () => {
    const user = userEvent.setup();
    renderDropdown();

    const trigger = screen.getByRole('button', { name: 'Karel Z.' });
    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu');
    expect(menu).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-controls', menu.id);
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
  });

  it('opens with ArrowDown on the first item', async () => {
    const user = userEvent.setup();
    renderDropdown();

    screen.getByRole('button', { name: 'Karel Z.' }).focus();
    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('menuitem', { name: 'Nastavení' })).toHaveFocus();
  });

  it('opens with ArrowUp on the last item', async () => {
    const user = userEvent.setup();
    renderDropdown();

    screen.getByRole('button', { name: 'Karel Z.' }).focus();
    await user.keyboard('{ArrowUp}');

    expect(screen.getByRole('menuitem', { name: 'Odhlásit se' })).toHaveFocus();
  });

  it('moves focus with the arrow keys and wraps at both ends', async () => {
    const user = userEvent.setup();
    renderDropdown();

    screen.getByRole('button', { name: 'Karel Z.' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Nastavení' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Správa →' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Odhlásit se' })).toHaveFocus();

    // Past the end wraps to the start.
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Nastavení' })).toHaveFocus();

    // ...and back the other way.
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Odhlásit se' })).toHaveFocus();
  });

  it('jumps to the first and last item with Home and End', async () => {
    const user = userEvent.setup();
    renderDropdown();

    screen.getByRole('button', { name: 'Karel Z.' }).focus();
    await user.keyboard('{ArrowDown}{End}');
    expect(screen.getByRole('menuitem', { name: 'Odhlásit se' })).toHaveFocus();

    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'Nastavení' })).toHaveFocus();
  });

  it('keeps exactly one item in the tab order (roving tabindex)', async () => {
    const user = userEvent.setup();
    renderDropdown();

    await user.click(screen.getByRole('button', { name: 'Karel Z.' }));

    const tabbable = screen
      .getAllByRole('menuitem')
      .filter((item) => item.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAccessibleName('Nastavení');

    await user.keyboard('{ArrowDown}');

    const afterMove = screen
      .getAllByRole('menuitem')
      .filter((item) => item.getAttribute('tabindex') === '0');
    expect(afterMove).toHaveLength(1);
    expect(afterMove[0]).toHaveAccessibleName('Správa →');
  });

  it('closes on Escape and puts focus back on the trigger', async () => {
    const user = userEvent.setup();
    renderDropdown();

    const trigger = screen.getByRole('button', { name: 'Karel Z.' });
    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    // A screen-reader user must be told the menu is actually gone, not just
    // that it visually disappeared.
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).not.toHaveAttribute('aria-controls');
  });

  it('closes on Tab and lets focus continue past the widget, not into it', async () => {
    const user = userEvent.setup();
    renderDropdown();

    await user.click(screen.getByRole('button', { name: 'Karel Z.' }));
    expect(screen.getByRole('menuitem', { name: 'Nastavení' })).toHaveFocus();

    await user.tab();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Za' })).toHaveFocus();
  });

  it('closes on Shift+Tab and continues backwards from the trigger', async () => {
    const user = userEvent.setup();
    renderDropdown();

    await user.click(screen.getByRole('button', { name: 'Karel Z.' }));
    await user.tab({ shift: true });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Před' })).toHaveFocus();
  });

  it('selects with Enter and reports the item id', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderDropdown();

    screen.getByRole('button', { name: 'Karel Z.' }).focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onSelect).toHaveBeenCalledWith('admin');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Karel Z.' })).toHaveFocus();
  });

  it('selects with Space as well', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderDropdown();

    screen.getByRole('button', { name: 'Karel Z.' }).focus();
    await user.keyboard('{ArrowUp}{ }');

    expect(onSelect).toHaveBeenCalledWith('signout');
  });

  it('selects with the pointer too', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderDropdown();

    await user.click(screen.getByRole('button', { name: 'Karel Z.' }));
    await user.click(screen.getByRole('menuitem', { name: 'Nastavení' }));

    expect(onSelect).toHaveBeenCalledWith('settings');
  });

  it('closes when something outside is clicked, without stealing focus', async () => {
    const user = userEvent.setup();
    renderDropdown();

    await user.click(screen.getByRole('button', { name: 'Karel Z.' }));
    const outsideButton = screen.getByRole('button', { name: 'Před' });
    await user.click(outsideButton);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    // "Without stealing focus": the click's own target keeps focus rather than
    // the dropdown redirecting it anywhere (e.g. back to its trigger).
    expect(outsideButton).toHaveFocus();
  });

  it('closes again when the trigger is clicked a second time', async () => {
    const user = userEvent.setup();
    renderDropdown();

    const trigger = screen.getByRole('button', { name: 'Karel Z.' });
    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('skips disabled items when arrowing, and refuses to select them', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    render(
      <Dropdown
        trigger="Akce"
        onSelect={onSelect}
        items={[
          { id: 'a', label: 'První' },
          { id: 'b', label: 'Zakázaná', disabled: true },
          { id: 'c', label: 'Třetí' },
        ]}
      />
    );

    screen.getByRole('button', { name: 'Akce' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'První' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Třetí' })).toHaveFocus();
    expect(screen.getByRole('menuitem', { name: 'Zakázaná' })).not.toHaveFocus();

    await user.click(screen.getByRole('menuitem', { name: 'Zakázaná' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  describe('when every item is disabled', () => {
    const ALL_DISABLED: DropdownItem[] = [
      { id: 'settings', label: 'Nastavení', disabled: true },
      { id: 'sep', separator: true },
      { id: 'admin', label: 'Správa', disabled: true },
    ];

    it('puts focus on the panel rather than leaving it on the trigger behind it', async () => {
      const user = userEvent.setup();
      renderDropdown({ items: ALL_DISABLED });

      const trigger = screen.getByRole('button', { name: 'Karel Z.' });
      await user.click(trigger);

      const menu = screen.getByRole('menu');

      expect(menu).toBeInTheDocument();
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      // Focus is not on the trigger: an open menu the keyboard cannot reach is
      // the failure this guards. `.focus()` on a disabled button is a no-op, so
      // before the fallback existed focus stayed here.
      expect(trigger).not.toHaveFocus();
      expect(menu).toHaveFocus();
    });

    it('still closes on Escape and hands focus back', async () => {
      const user = userEvent.setup();
      renderDropdown({ items: ALL_DISABLED });

      const trigger = screen.getByRole('button', { name: 'Karel Z.' });
      await user.click(trigger);

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });

    it('adds no tab stop of its own — the panel is reachable only programmatically', async () => {
      const user = userEvent.setup();
      renderDropdown({ items: ALL_DISABLED });

      await user.click(screen.getByRole('button', { name: 'Karel Z.' }));

      expect(screen.getByRole('menu')).toHaveAttribute('tabindex', '-1');
    });
  });

  it('names the menu after its trigger unless given a name of its own', async () => {
    const user = userEvent.setup();
    renderDropdown();

    await user.click(screen.getByRole('button', { name: 'Karel Z.' }));
    expect(screen.getByRole('menu')).toHaveAccessibleName('Karel Z.');
  });

  it('takes an explicit menu label', async () => {
    const user = userEvent.setup();
    renderDropdown({ label: 'Uživatelské menu' });

    await user.click(screen.getByRole('button', { name: 'Karel Z.' }));
    expect(screen.getByRole('menu')).toHaveAccessibleName('Uživatelské menu');
  });

  it('renders a separator between groups of items, skipped by the arrow keys', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    render(
      <Dropdown
        trigger="Karel Z."
        onSelect={onSelect}
        items={[
          { id: 'settings', label: 'Nastavení' },
          { id: 'sep', separator: true },
          { id: 'signout', label: 'Odhlásit se', danger: true },
        ]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Karel Z.' }));

    // A separator is not a menu item...
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    expect(screen.getByRole('separator')).toBeInTheDocument();

    // ...and the arrow keys step straight over it.
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Odhlásit se' })).toHaveFocus();
  });

  it('renders a non-focusable header above the items', async () => {
    const user = userEvent.setup();
    renderDropdown({ header: <span>karel@firma.cz</span> });

    await user.click(screen.getByRole('button', { name: 'Karel Z.' }));

    const header = screen.getByText('karel@firma.cz');
    expect(header).toBeInTheDocument();
    // The header must not become a menu item, or arrow keys would stop on it.
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
    // Non-focusable, not merely "not a menuitem": nothing inside it can take
    // Tab or roving-tabindex focus.
    expect(within(header.closest('div') ?? header).queryAllByRole('button')).toHaveLength(0);
    expect(header).not.toHaveAttribute('tabindex');
  });

  it('closes only the menu, not a surrounding open Modal, on Escape', async () => {
    const user = userEvent.setup();

    // The menu and the modal are both registered with the page-wide layer set
    // (see dismissable-layer.ts), and the menu sits inside the modal's dialog,
    // so the press is the menu's. `onClose` is wired to real state, not a
    // no-op, so the modal actually unmounts if it fires — a no-op `onClose`
    // would make this test pass regardless of whether the bug exists.
    function Host() {
      const [open, setOpen] = useState(true);
      return (
        <Modal open={open} onClose={() => setOpen(false)} title="Nastavení" hideCloseButton>
          <Dropdown trigger="Karel Z." items={ITEMS} />
        </Modal>
      );
    }

    render(<Host />);

    await user.click(screen.getByRole('button', { name: 'Karel Z.' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
