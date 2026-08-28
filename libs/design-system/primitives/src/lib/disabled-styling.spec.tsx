import { render, screen } from '@testing-library/react';

import { Button } from './button';
import { Checkbox } from './checkbox';
import { Input } from './input';
import { Radio } from './radio';
import { Select } from './select';
import { Stepper } from './stepper';
import { Switch } from './switch';

/**
 * Guards the one styling rule in this lib that unit tests can otherwise never
 * see: **a state's look is swapped in, never layered on top.**
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
 * we *can* assert is the invariant that makes stylesheet order irrelevant:
 * **an element must never carry two unconditional classes that set the same
 * colour property.** That is checked below as a property-group count rather
 * than as a hardcoded list of known-bad pairs, so it bites for pairs nobody
 * has thought of yet, in components that do not exist yet.
 */

/**
 * Every colour token name that can appear as the value half of a `bg-*`,
 * `text-*` or `border-*` utility in this lib. Listed explicitly because the
 * three prefixes are overloaded: `text-sm` is a font size, `border-2` a width,
 * `bg-none` an image. Matching on the *token* rather than on the prefix is
 * what keeps those out of the colour groups.
 */
const COLOR_TOKENS = [
  'bg',
  'bg-soft',
  'bg-muted',
  'bg-inverse',
  'fg',
  'fg-2',
  'fg-3',
  'fg-on-yellow',
  'fg-on-green',
  'fg-on-blue',
  'fg-on-light',
  'fg-on-dark',
  'border',
  'border-strong',
  'divider',
  'brand-blue',
  'brand-blue-700',
  'brand-blue-100',
  'brand-green',
  'brand-green-700',
  'brand-green-100',
  'brand-yellow',
  'brand-yellow-700',
  'brand-yellow-100',
  'brand-light',
  'brand-dark',
  'brand-black',
  'success',
  'info',
  'warning',
  'danger',
  'danger-100',
  'transparent',
  'current',
  'inherit',
];

/** The three CSS properties a colour utility can land on. */
const COLOR_PROPERTIES = ['bg', 'text', 'border'] as const;
type ColorProperty = (typeof COLOR_PROPERTIES)[number];

/**
 * Classifies one class name as `{ property, token }` if — and only if — it is
 * an *unconditional* colour utility. A variant class (`hover:`, `checked:`,
 * `focus-visible:`, `disabled:`, ...) is excluded: variants raise specificity
 * or apply in a different state, so two of them, or a variant plus a base, are
 * not the hazard this test is about.
 */
function classifyColorClass(cls: string): { property: ColorProperty; token: string } | null {
  if (cls.includes(':')) {
    return null;
  }
  for (const property of COLOR_PROPERTIES) {
    const prefix = `${property}-`;
    if (!cls.startsWith(prefix)) {
      continue;
    }
    const token = cls.slice(prefix.length);
    if (COLOR_TOKENS.includes(token)) {
      return { property, token };
    }
  }

  return null;
}

/**
 * Asserts that no element in the tree carries two unconditional colour classes
 * that set the same property. `elements` are named so a failure says which
 * component and which part of it broke.
 */
function expectNoLayeredColors(label: string, elements: HTMLElement[]) {
  for (const element of elements) {
    const byProperty = new Map<ColorProperty, string[]>();
    for (const cls of element.className.split(/\s+/).filter(Boolean)) {
      const hit = classifyColorClass(cls);
      if (!hit) {
        continue;
      }
      byProperty.set(hit.property, [...(byProperty.get(hit.property) ?? []), cls]);
    }

    for (const [property, classes] of byProperty) {
      expect({ label, property, classes }).toEqual({
        label,
        property,
        classes: [classes[0]],
      });
    }
  }
}

describe('primitives swap their colors instead of layering them', () => {
  describe('when disabled', () => {
    it('Button', () => {
      render(<Button disabled>Uložit</Button>);

      expectNoLayeredColors('Button', [screen.getByRole('button', { name: 'Uložit' })]);
    });

    it('Input', () => {
      render(<Input label="Jméno" disabled />);

      expectNoLayeredColors('Input', [screen.getByLabelText('Jméno')]);
    });

    it('Input that is also invalid keeps only one border colour, and it is the disabled one', () => {
      render(<Input label="Jméno" error="Vyplňte jméno" disabled />);

      const input = screen.getByLabelText('Jméno');
      expectNoLayeredColors('Input (invalid + disabled)', [input]);
      expect(input.className).not.toContain('border-danger');
    });

    it('Select', () => {
      render(
        <Select label="Patro" disabled>
          <option value="1">1</option>
        </Select>
      );

      expectNoLayeredColors('Select', [screen.getByLabelText('Patro')]);
    });

    it('Select that is also invalid keeps only one border colour, and it is the disabled one', () => {
      render(
        <Select label="Patro" error="Vyberte patro" disabled>
          <option value="1">1</option>
        </Select>
      );

      const select = screen.getByLabelText('Patro');
      expectNoLayeredColors('Select (invalid + disabled)', [select]);
      expect(select.className).not.toContain('border-danger');
    });

    it('Checkbox', () => {
      render(<Checkbox label="Souhlasím" disabled />);

      expectNoLayeredColors('Checkbox', [screen.getByLabelText('Souhlasím')]);
    });

    it('Radio', () => {
      render(<Radio name="volba" value="a" label="Možnost A" disabled />);

      expectNoLayeredColors('Radio', [screen.getByLabelText('Možnost A')]);
    });

    it('Switch, in both positions', () => {
      const { rerender } = render(<Switch label="Zapnout" disabled />);
      expectNoLayeredColors('Switch (off)', [screen.getByRole('switch', { name: 'Zapnout' })]);

      rerender(<Switch label="Zapnout" checked disabled />);
      expectNoLayeredColors('Switch (on)', [screen.getByRole('switch', { name: 'Zapnout' })]);
    });

    it('Stepper value and both step buttons', () => {
      render(<Stepper label="Počet" min={0} max={10} defaultValue={5} disabled />);

      expectNoLayeredColors('Stepper', [
        screen.getByRole('spinbutton', { name: 'Počet' }),
        screen.getByRole('button', { name: 'Snížit' }),
        screen.getByRole('button', { name: 'Zvýšit' }),
      ]);
    });
  });

  describe('when enabled', () => {
    it('Switch, in both positions', () => {
      const { rerender } = render(<Switch label="Zapnout" />);
      expectNoLayeredColors('Switch (off)', [screen.getByRole('switch', { name: 'Zapnout' })]);

      rerender(<Switch label="Zapnout" checked />);
      expectNoLayeredColors('Switch (on)', [screen.getByRole('switch', { name: 'Zapnout' })]);
    });

    it('Button, every variant', () => {
      for (const variant of ['primary', 'secondary', 'outline', 'danger', 'ghost'] as const) {
        const { unmount } = render(<Button variant={variant}>Uložit</Button>);
        expectNoLayeredColors(`Button (${variant})`, [
          screen.getByRole('button', { name: 'Uložit' }),
        ]);
        unmount();
      }
    });

    it('Input, valid and invalid', () => {
      const { rerender } = render(<Input label="Jméno" />);
      expectNoLayeredColors('Input (valid)', [screen.getByLabelText('Jméno')]);

      rerender(<Input label="Jméno" error="Vyplňte jméno" />);
      expectNoLayeredColors('Input (invalid)', [screen.getByLabelText('Jméno')]);
    });
  });

  it('greys the checked fill too, so a disabled Checkbox never reads as actionable', () => {
    render(<Checkbox label="Souhlasím" defaultChecked disabled />);

    const box = screen.getByLabelText('Souhlasím');
    expect(box.className).not.toContain('checked:bg-brand-blue');
    expect(box.className).toContain('checked:bg-border-strong');
  });
});
