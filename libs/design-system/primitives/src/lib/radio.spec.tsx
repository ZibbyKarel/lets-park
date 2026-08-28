import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Radio, RadioGroup } from './radio';

describe('Radio', () => {
  it('exposes a radio with its label as the accessible name', () => {
    render(<Radio name="demo" label="Denně" />);

    expect(screen.getByRole('radio', { name: 'Denně' })).toBeInTheDocument();
  });

  it('selects on click and on click of the label', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Radio name="freq" value="daily" label="Denně" />
        <Radio name="freq" value="weekly" label="Týdně" />
      </>
    );

    await user.click(screen.getByRole('radio', { name: 'Denně' }));
    expect(screen.getByRole('radio', { name: 'Denně' })).toBeChecked();

    await user.click(screen.getByText('Týdně'));
    expect(screen.getByRole('radio', { name: 'Týdně' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Denně' })).not.toBeChecked();
  });

  it('moves the selection with the arrow keys inside one name group', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Radio name="freq" value="daily" label="Denně" defaultChecked />
        <Radio name="freq" value="weekly" label="Týdně" />
        <Radio name="freq" value="never" label="Vůbec" />
      </>
    );

    await user.tab();
    expect(screen.getByRole('radio', { name: 'Denně' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'Týdně' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Týdně' })).toHaveFocus();
  });

  it('makes the group a single tab stop', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Radio name="freq" value="daily" label="Denně" defaultChecked />
        <Radio name="freq" value="weekly" label="Týdně" />
        <button type="button">Dál</button>
      </>
    );

    await user.tab();
    expect(screen.getByRole('radio', { name: 'Denně' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Dál' })).toHaveFocus();
  });

  it('does not carry aria-invalid, which its role does not support', () => {
    render(<Radio name="demo" label="Denně" error="Chyba" />);

    expect(screen.getByRole('radio', { name: 'Denně' })).not.toHaveAttribute('aria-invalid');
  });

  it('does not select or take focus when disabled', async () => {
    const user = userEvent.setup();
    render(<Radio name="demo" label="Denně" disabled />);

    const radio = screen.getByRole('radio', { name: 'Denně' });
    await user.click(radio);

    expect(radio).toBeDisabled();
    expect(radio).not.toBeChecked();
  });

  it('forwards a ref to the underlying element', () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<Radio name="demo" label="Denně" ref={ref} />);

    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});

describe('RadioGroup', () => {
  it('gives the whole set one accessible name', () => {
    render(
      <RadioGroup legend="Jak často">
        <Radio name="freq" value="daily" label="Denně" />
      </RadioGroup>
    );

    expect(screen.getByRole('group', { name: 'Jak často' })).toBeInTheDocument();
  });

  it('carries the invalid state and the error message for the group', () => {
    render(
      <RadioGroup legend="Jak často" error="Vyber prosím možnost.">
        <Radio name="freq" value="daily" label="Denně" />
      </RadioGroup>
    );

    const group = screen.getByRole('group', { name: 'Jak často' });
    expect(group).toHaveAttribute('aria-invalid', 'true');
    expect(group).toHaveAccessibleDescription('Vyber prosím možnost.');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('describes the group with its hint', () => {
    render(
      <RadioGroup legend="Jak často" hint="Změnit můžeš kdykoli.">
        <Radio name="freq" value="daily" label="Denně" />
      </RadioGroup>
    );

    expect(screen.getByRole('group')).toHaveAccessibleDescription('Změnit můžeš kdykoli.');
  });
});
