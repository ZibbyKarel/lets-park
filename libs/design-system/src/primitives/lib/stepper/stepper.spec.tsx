import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Stepper } from './stepper';

describe('Stepper', () => {
  it('exposes a spinbutton carrying the current value and its bounds', () => {
    render(<Stepper label="Počet" min={1} max={31} defaultValue={7} />);

    const spin = screen.getByRole('spinbutton', { name: 'Počet' });
    expect(spin).toHaveAttribute('aria-valuenow', '7');
    expect(spin).toHaveAttribute('aria-valuemin', '1');
    expect(spin).toHaveAttribute('aria-valuemax', '31');
  });

  it('gives both buttons a spoken name of their own', () => {
    render(<Stepper label="Počet" min={0} max={10} defaultValue={5} />);

    expect(screen.getByRole('button', { name: 'Snížit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zvýšit' })).toBeInTheDocument();
  });

  it('steps with the buttons', async () => {
    const user = userEvent.setup();
    const onValueChange = jest.fn();
    render(
      <Stepper label="Počet" min={0} max={10} defaultValue={5} onValueChange={onValueChange} />
    );

    await user.click(screen.getByRole('button', { name: 'Zvýšit' }));
    expect(onValueChange).toHaveBeenLastCalledWith(6);
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '6');

    await user.click(screen.getByRole('button', { name: 'Snížit' }));
    expect(onValueChange).toHaveBeenLastCalledWith(5);
  });

  it('steps with the arrow keys and jumps with Home and End', async () => {
    const user = userEvent.setup();
    render(<Stepper label="Počet" min={0} max={10} defaultValue={5} />);

    const spin = screen.getByRole('spinbutton', { name: 'Počet' });
    spin.focus();

    await user.keyboard('{ArrowUp}');
    expect(spin).toHaveAttribute('aria-valuenow', '6');

    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(spin).toHaveAttribute('aria-valuenow', '4');

    await user.keyboard('{Home}');
    expect(spin).toHaveAttribute('aria-valuenow', '0');

    await user.keyboard('{End}');
    expect(spin).toHaveAttribute('aria-valuenow', '10');
  });

  it('puts the value in the tab order between the two buttons', async () => {
    const user = userEvent.setup();
    render(<Stepper label="Počet" min={0} max={10} defaultValue={5} />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Snížit' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('spinbutton', { name: 'Počet' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Zvýšit' })).toHaveFocus();
  });

  it('clamps at both bounds and disables the button that would overshoot', async () => {
    const user = userEvent.setup();
    const onValueChange = jest.fn();
    render(
      <Stepper label="Počet" min={1} max={3} defaultValue={1} onValueChange={onValueChange} />
    );

    expect(screen.getByRole('button', { name: 'Snížit' })).toBeDisabled();

    const spin = screen.getByRole('spinbutton', { name: 'Počet' });
    spin.focus();
    await user.keyboard('{ArrowDown}');

    expect(spin).toHaveAttribute('aria-valuenow', '1');
    expect(onValueChange).not.toHaveBeenCalled();

    await user.keyboard('{End}');
    expect(spin).toHaveAttribute('aria-valuenow', '3');
    expect(screen.getByRole('button', { name: 'Zvýšit' })).toBeDisabled();
  });

  it('honours a custom step', async () => {
    const user = userEvent.setup();
    render(<Stepper label="Počet" min={0} max={100} step={5} defaultValue={20} />);

    await user.click(screen.getByRole('button', { name: 'Zvýšit' }));

    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '25');
  });

  it('reads the formatted text aloud as well as showing it', () => {
    render(
      <Stepper
        label="Počet dní"
        min={1}
        max={31}
        defaultValue={1}
        formatValue={(v) => `${v} den`}
      />
    );

    const spin = screen.getByRole('spinbutton', { name: 'Počet dní' });
    expect(spin).toHaveAttribute('aria-valuetext', '1 den');
    expect(spin).toHaveTextContent('1 den');
  });

  it('stays where the controlling parent puts it', async () => {
    const user = userEvent.setup();
    const onValueChange = jest.fn();
    render(<Stepper label="Počet" min={0} max={10} value={4} onValueChange={onValueChange} />);

    await user.click(screen.getByRole('button', { name: 'Zvýšit' }));

    expect(onValueChange).toHaveBeenCalledWith(5);
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '4');
  });

  it('takes itself out of the tab order and refuses input when disabled', async () => {
    const user = userEvent.setup();
    const onValueChange = jest.fn();
    render(
      <Stepper
        label="Počet"
        min={0}
        max={10}
        defaultValue={5}
        disabled
        onValueChange={onValueChange}
      />
    );

    const spin = screen.getByRole('spinbutton', { name: 'Počet' });
    expect(spin).toHaveAttribute('tabindex', '-1');
    expect(spin).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Zvýšit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Snížit' })).toBeDisabled();

    await user.tab();
    expect(spin).not.toHaveFocus();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('accepts Czech names for the two buttons', () => {
    render(
      <Stepper
        label="Počet"
        min={0}
        max={10}
        defaultValue={5}
        decrementLabel="Ubrat"
        incrementLabel="Přidat"
      />
    );

    expect(screen.getByRole('button', { name: 'Ubrat' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Přidat' })).toBeInTheDocument();
  });
});
