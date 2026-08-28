import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Input } from './input';

describe('Input', () => {
  it('uses its label as the accessible name', () => {
    render(<Input label="Jméno" />);

    expect(screen.getByRole('textbox', { name: 'Jméno' })).toBeInTheDocument();
  });

  it('focuses the field when its label is clicked', async () => {
    const user = userEvent.setup();
    render(<Input label="Jméno" />);

    await user.click(screen.getByText('Jméno'));

    expect(screen.getByRole('textbox', { name: 'Jméno' })).toHaveFocus();
  });

  it('accepts typed text', async () => {
    const user = userEvent.setup();
    render(<Input label="Jméno" />);

    const input = screen.getByRole('textbox', { name: 'Jméno' });
    await user.type(input, 'Karel');

    expect(input).toHaveValue('Karel');
  });

  it('describes the field with its hint', () => {
    render(<Input label="Jméno" hint="Uvidí ho ostatní." />);

    expect(screen.getByRole('textbox', { name: 'Jméno' })).toHaveAccessibleDescription(
      'Uvidí ho ostatní.'
    );
  });

  it('marks the field invalid and announces the error message', () => {
    render(<Input label="Jméno" error="Vyplň prosím jméno." />);

    const input = screen.getByRole('textbox', { name: 'Jméno' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Vyplň prosím jméno.');
    expect(screen.getByRole('alert')).toHaveTextContent('Vyplň prosím jméno.');
  });

  it('describes the field with both hint and error at once', () => {
    render(<Input label="Jméno" hint="Uvidí ho ostatní." error="Vyplň prosím jméno." />);

    expect(screen.getByRole('textbox')).toHaveAccessibleDescription(
      'Uvidí ho ostatní. Vyplň prosím jméno.'
    );
  });

  it('is not invalid when there is no error', () => {
    render(<Input label="Jméno" />);

    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid');
  });

  it('cannot be typed into or tabbed to when disabled', async () => {
    const user = userEvent.setup();
    render(<Input label="Jméno" disabled />);

    const input = screen.getByRole('textbox', { name: 'Jméno' });
    await user.type(input, 'Karel');

    expect(input).toBeDisabled();
    expect(input).toHaveValue('');

    await user.tab();
    expect(input).not.toHaveFocus();
  });

  it('honours a caller-supplied id instead of generating one', () => {
    render(<Input label="Jméno" id="explicit-id" />);

    expect(screen.getByRole('textbox', { name: 'Jméno' })).toHaveAttribute('id', 'explicit-id');
  });

  it('gives two instances distinct ids so labels do not cross-wire', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Input label="První" />
        <Input label="Druhé" />
      </>
    );

    await user.click(screen.getByText('Druhé'));

    expect(screen.getByRole('textbox', { name: 'Druhé' })).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'První' })).not.toHaveFocus();
  });

  it('forwards a ref to the underlying element', () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<Input label="Jméno" ref={ref} />);

    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});
