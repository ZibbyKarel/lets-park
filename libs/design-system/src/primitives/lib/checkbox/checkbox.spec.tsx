import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Checkbox } from './checkbox';

describe('Checkbox', () => {
  it('exposes a checkbox with its label as the accessible name', () => {
    render(<Checkbox label="Posílat upozornění" />);

    expect(screen.getByRole('checkbox', { name: 'Posílat upozornění' })).toBeInTheDocument();
  });

  it('toggles with the pointer and with the space bar', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<Checkbox label="Posílat upozornění" onChange={onChange} />);

    const checkbox = screen.getByRole('checkbox', { name: 'Posílat upozornění' });
    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    checkbox.focus();
    await user.keyboard(' ');
    expect(checkbox).not.toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('toggles when the label is clicked', async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Posílat upozornění" />);

    await user.click(screen.getByText('Posílat upozornění'));

    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('is reachable with Tab', async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Posílat upozornění" />);

    await user.tab();

    expect(screen.getByRole('checkbox')).toHaveFocus();
  });

  it('reflects the indeterminate state on the DOM node', () => {
    const { rerender } = render(<Checkbox label="Vybrané" indeterminate />);

    const checkbox = screen.getByRole<HTMLInputElement>('checkbox');
    expect(checkbox.indeterminate).toBe(true);
    expect(checkbox).toBePartiallyChecked();

    rerender(<Checkbox label="Vybrané" indeterminate={false} />);
    expect(checkbox.indeterminate).toBe(false);
  });

  it('marks the control invalid and announces the error message', () => {
    render(<Checkbox label="Souhlas" error="Tuhle volbu je nutné potvrdit." />);

    const checkbox = screen.getByRole('checkbox', { name: 'Souhlas' });
    expect(checkbox).toHaveAttribute('aria-invalid', 'true');
    expect(checkbox).toHaveAccessibleDescription('Tuhle volbu je nutné potvrdit.');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('describes the control with its hint', () => {
    render(<Checkbox label="Souhlas" hint="Chodí e-mailem." />);

    expect(screen.getByRole('checkbox')).toHaveAccessibleDescription('Chodí e-mailem.');
  });

  it('does not toggle or take focus when disabled', async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Souhlas" disabled />);

    const checkbox = screen.getByRole('checkbox', { name: 'Souhlas' });
    await user.click(checkbox);

    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();

    await user.tab();
    expect(checkbox).not.toHaveFocus();
  });

  it('forwards a ref while still driving the indeterminate flag itself', () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<Checkbox label="Vybrané" indeterminate ref={ref} />);

    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current?.indeterminate).toBe(true);
  });
});
