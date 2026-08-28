import { render, screen } from '@testing-library/react';

import { Button } from './button';
import { Checkbox } from './checkbox';
import { Input } from './input';
import { Radio } from './radio';
import { Select } from './select';
import { Stepper } from './stepper';

/**
 * Guards the one styling rule in this lib that unit tests can otherwise never
 * see: **the disabled look is swapped in, never layered on top.**
 *
 * Two utilities that set the same CSS property (`bg-bg` and `bg-bg-muted`,
 * `text-fg` and `text-fg-3`) have equal specificity, so the winner is decided
 * by their order in the generated stylesheet — which Tailwind chooses — not by
 * the order they appear in `className`. Layering the disabled colors on top of
 * the enabled ones therefore works or silently fails per utility pair. It did
 * fail once: `text-border-strong` is emitted before `text-fg`, so a disabled
 * step button kept full-strength text.
 *
 * jsdom applies no stylesheet, so no rendering assertion can catch this. What
 * we can assert is the invariant that makes order irrelevant: when a control
 * is disabled, the enabled-only color classes must be *absent*.
 */
describe('disabled primitives swap their colors instead of layering them', () => {
  const enabledOnly = ['bg-bg', 'text-fg'];

  function expectNoEnabledColors(element: HTMLElement) {
    const classes = element.className.split(/\s+/);
    for (const cls of enabledOnly) {
      expect(classes).not.toContain(cls);
    }
  }

  it('Button', () => {
    render(<Button disabled>Uložit</Button>);

    expectNoEnabledColors(screen.getByRole('button', { name: 'Uložit' }));
  });

  it('Input', () => {
    render(<Input label="Jméno" disabled />);

    expectNoEnabledColors(screen.getByLabelText('Jméno'));
  });

  it('Select', () => {
    render(
      <Select label="Patro" disabled>
        <option value="1">1</option>
      </Select>
    );

    expectNoEnabledColors(screen.getByLabelText('Patro'));
  });

  it('Checkbox', () => {
    render(<Checkbox label="Souhlasím" disabled />);

    expectNoEnabledColors(screen.getByLabelText('Souhlasím'));
  });

  it('Radio', () => {
    render(<Radio name="volba" value="a" label="Možnost A" disabled />);

    expectNoEnabledColors(screen.getByLabelText('Možnost A'));
  });

  it('Stepper value and both step buttons', () => {
    render(<Stepper label="Počet" min={0} max={10} defaultValue={5} disabled />);

    expectNoEnabledColors(screen.getByRole('spinbutton', { name: 'Počet' }));
    expectNoEnabledColors(screen.getByRole('button', { name: 'Snížit' }));
    expectNoEnabledColors(screen.getByRole('button', { name: 'Zvýšit' }));
  });

  it('greys the checked fill too, so a disabled Checkbox never reads as actionable', () => {
    render(<Checkbox label="Souhlasím" defaultChecked disabled />);

    const box = screen.getByLabelText('Souhlasím');
    expect(box.className).not.toContain('checked:bg-brand-blue');
    expect(box.className).toContain('checked:bg-border-strong');
  });
});
