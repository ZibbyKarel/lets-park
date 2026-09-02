import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Dropdown, type DropdownItem } from './dropdown';
import { Tooltip } from './tooltip';

const ITEMS: DropdownItem[] = [
  { id: 'a', label: 'První' },
  { id: 'b', label: 'Druhá' },
];

describe('Escape across sibling layers', () => {
  it('closes the menu the keyboard is in, not an unrelated hovered tooltip', async () => {
    const user = userEvent.setup();

    render(
      <div>
        <Dropdown trigger="Menu" items={ITEMS} />
        <Tooltip content="Nápověda">
          <button type="button">Detail</button>
        </Tooltip>
      </div>
    );

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // Hover moves the pointer but not the keyboard: focus stays on the menu
    // item, so an Escape now is unambiguously aimed at the menu.
    await user.hover(screen.getByRole('button', { name: 'Detail' }));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'První' })).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    // And the tooltip is still reachable by a second press — nothing has been
    // swallowed permanently.
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
