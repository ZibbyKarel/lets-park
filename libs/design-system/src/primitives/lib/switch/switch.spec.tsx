import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Switch } from './switch';

describe('Switch', () => {
  it('exposes role="switch" with its label as the accessible name', () => {
    render(<Switch label="Správce" />);

    const toggle = screen.getByRole('switch', { name: 'Správce' });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('falls back to aria-label when there is no visible label', () => {
    render(<Switch aria-label="Přepnout zobrazení" />);

    expect(screen.getByRole('switch', { name: 'Přepnout zobrazení' })).toBeInTheDocument();
  });

  it('toggles on click and reports the state it is moving to', async () => {
    const user = userEvent.setup();
    const onCheckedChange = jest.fn();
    render(<Switch label="Správce" onCheckedChange={onCheckedChange} />);

    const toggle = screen.getByRole('switch', { name: 'Správce' });
    await user.click(toggle);

    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await user.click(toggle);
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('is reachable with Tab and operable with Enter and Space', async () => {
    const user = userEvent.setup();
    render(<Switch label="Správce" />);

    await user.tab();
    const toggle = screen.getByRole('switch', { name: 'Správce' });
    expect(toggle).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('toggles when its visible label is clicked', async () => {
    const user = userEvent.setup();
    render(<Switch label="Správce" />);

    await user.click(screen.getByText('Správce'));

    expect(screen.getByRole('switch', { name: 'Správce' })).toHaveAttribute('aria-checked', 'true');
  });

  it('stays where the controlling parent puts it', async () => {
    const user = userEvent.setup();
    const onCheckedChange = jest.fn();
    render(<Switch label="Správce" checked={false} onCheckedChange={onCheckedChange} />);

    const toggle = screen.getByRole('switch', { name: 'Správce' });
    await user.click(toggle);

    // Reported, but not applied — the parent owns the value.
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('honours defaultChecked when uncontrolled', () => {
    render(<Switch label="Správce" defaultChecked />);

    expect(screen.getByRole('switch', { name: 'Správce' })).toHaveAttribute('aria-checked', 'true');
  });

  it('does not toggle or take focus when disabled', async () => {
    const user = userEvent.setup();
    const onCheckedChange = jest.fn();
    render(<Switch label="Správce" disabled onCheckedChange={onCheckedChange} />);

    const toggle = screen.getByRole('switch', { name: 'Správce' });
    await user.click(toggle);

    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(toggle).toBeDisabled();

    await user.tab();
    expect(toggle).not.toHaveFocus();
  });

  it('never submits a surrounding form', () => {
    render(<Switch label="Správce" />);

    expect(screen.getByRole('switch', { name: 'Správce' })).toHaveAttribute('type', 'button');
  });
});
