import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Tabs, type TabItem } from './tabs';

const ITEMS: TabItem[] = [
  { id: 'users', label: 'Uživatelé', content: <p>Obsah uživatelů</p> },
  { id: 'spots', label: 'Místa', content: <p>Obsah míst</p> },
  { id: 'rules', label: 'Pravidla', content: <p>Obsah pravidel</p> },
];

describe('Tabs', () => {
  it('wires the tablist, tabs and panel to each other', () => {
    render(<Tabs items={ITEMS} label="Administrace" />);

    const tablist = screen.getByRole('tablist', { name: 'Administrace' });
    expect(tablist).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);

    const selected = screen.getByRole('tab', { name: 'Uživatelé' });
    const panel = screen.getByRole('tabpanel');

    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(selected).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', selected.id);
    expect(panel).toHaveAccessibleName('Uživatelé');
  });

  it('selects the first tab by default and shows only its panel', () => {
    render(<Tabs items={ITEMS} />);

    expect(screen.getByText('Obsah uživatelů')).toBeInTheDocument();
    expect(screen.queryByText('Obsah míst')).not.toBeInTheDocument();
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('honours defaultValue', () => {
    render(<Tabs items={ITEMS} defaultValue="rules" />);

    expect(screen.getByRole('tab', { name: 'Pravidla' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Obsah pravidel')).toBeInTheDocument();
  });

  it('moves focus and selection with the arrow keys, wrapping at both ends', async () => {
    const user = userEvent.setup();
    render(<Tabs items={ITEMS} />);

    screen.getByRole('tab', { name: 'Uživatelé' }).focus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Místa' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Místa' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Obsah míst')).toBeInTheDocument();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Pravidla' })).toHaveFocus();

    // Past the end wraps to the start.
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Uživatelé' })).toHaveFocus();
    expect(screen.getByText('Obsah uživatelů')).toBeInTheDocument();

    // ...and backwards wraps the other way.
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Pravidla' })).toHaveFocus();
    expect(screen.getByText('Obsah pravidel')).toBeInTheDocument();
  });

  it('jumps to the first and last tab with Home and End', async () => {
    const user = userEvent.setup();
    render(<Tabs items={ITEMS} />);

    screen.getByRole('tab', { name: 'Uživatelé' }).focus();

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Pravidla' })).toHaveFocus();
    expect(screen.getByText('Obsah pravidel')).toBeInTheDocument();

    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Uživatelé' })).toHaveFocus();
    expect(screen.getByText('Obsah uživatelů')).toBeInTheDocument();
  });

  it('leaves ArrowUp and ArrowDown alone, so the page still scrolls', async () => {
    const user = userEvent.setup();
    render(<Tabs items={ITEMS} />);

    const first = screen.getByRole('tab', { name: 'Uživatelé' });
    first.focus();

    await user.keyboard('{ArrowDown}{ArrowUp}');

    expect(first).toHaveFocus();
    expect(first).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps exactly one tab in the tab order and moves it with the selection', async () => {
    const user = userEvent.setup();
    render(<Tabs items={ITEMS} />);

    const tabbable = () =>
      screen.getAllByRole('tab').filter((tab) => tab.getAttribute('tabindex') === '0');

    expect(tabbable()).toHaveLength(1);
    expect(tabbable()[0]).toHaveAccessibleName('Uživatelé');

    screen.getByRole('tab', { name: 'Uživatelé' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(tabbable()).toHaveLength(1);
    expect(tabbable()[0]).toHaveAccessibleName('Místa');
  });

  it('is one stop in the page tab order: Tab goes from the strip into the panel', async () => {
    const user = userEvent.setup();
    render(<Tabs items={ITEMS} />);

    screen.getByRole('tab', { name: 'Uživatelé' }).focus();

    await user.tab();

    expect(screen.getByRole('tabpanel')).toHaveFocus();
  });

  it('selects with the pointer as well', async () => {
    const user = userEvent.setup();
    const onValueChange = jest.fn();
    render(<Tabs items={ITEMS} onValueChange={onValueChange} />);

    await user.click(screen.getByRole('tab', { name: 'Pravidla' }));

    expect(onValueChange).toHaveBeenCalledWith('rules');
    expect(screen.getByText('Obsah pravidel')).toBeInTheDocument();
  });

  it('skips disabled tabs when arrowing and cannot select them by click', async () => {
    const user = userEvent.setup();
    const onValueChange = jest.fn();
    render(
      <Tabs
        onValueChange={onValueChange}
        items={[
          { id: 'a', label: 'První', content: <p>A</p> },
          { id: 'b', label: 'Zakázaná', content: <p>B</p>, disabled: true },
          { id: 'c', label: 'Třetí', content: <p>C</p> },
        ]}
      />
    );

    screen.getByRole('tab', { name: 'První' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'Třetí' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Zakázaná' })).toHaveAttribute('aria-selected', 'false');

    await user.click(screen.getByRole('tab', { name: 'Zakázaná' }));
    expect(onValueChange).not.toHaveBeenCalledWith('b');
  });

  it('stays where the controlling parent puts it', async () => {
    const user = userEvent.setup();
    const onValueChange = jest.fn();
    render(<Tabs items={ITEMS} value="users" onValueChange={onValueChange} />);

    await user.click(screen.getByRole('tab', { name: 'Místa' }));

    expect(onValueChange).toHaveBeenCalledWith('spots');
    expect(screen.getByRole('tab', { name: 'Uživatelé' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Obsah uživatelů')).toBeInTheDocument();
  });

  it('does not fire onValueChange when the already-selected tab is clicked', async () => {
    const user = userEvent.setup();
    const onValueChange = jest.fn();
    render(<Tabs items={ITEMS} onValueChange={onValueChange} />);

    await user.click(screen.getByRole('tab', { name: 'Uživatelé' }));

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('marks every unselected tab aria-selected=false rather than omitting it', () => {
    render(<Tabs items={ITEMS} />);

    const selectedStates = screen
      .getAllByRole('tab')
      .map((tab) => tab.getAttribute('aria-selected'));

    expect(selectedStates).toEqual(['true', 'false', 'false']);
  });
});
