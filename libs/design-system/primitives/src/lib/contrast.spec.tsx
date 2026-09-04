import { render, screen } from '@testing-library/react';

import { COLOR_UTILITIES } from '@lets-park/design-system/tokens';

import { Avatar, type AvatarTone } from './avatar/avatar';
import { Badge, type BadgeTone } from './badge/badge';
import { Button, type ButtonVariant } from './button/button';
import { Input } from './input/input';
import { Modal } from './modal/modal';
import { Stepper } from './stepper/stepper';
import { Toast, type ToastTone } from './toast/toast';

/**
 * Colour-contrast guard for the pairings this lib chooses.
 *
 * The `--brand-*` hexes are the design's and are not negotiable here; which
 * foreground is drawn on which background **is** this lib's own decision, and
 * it is the decision that was wrong. Six pairings were measured below AA at
 * body sizes in the final review — the success badge at 2.31:1 and the toast's
 * success glyph at 1.88:1 among them.
 *
 * Every ratio below is computed from `COLOR_UTILITIES` — the tokens lib's own
 * derived name→value map, which `theme-css.spec.ts` holds equal to the
 * `--color-*` block of `theme.css` — not asserted as a literal. The classes are
 * read off the **rendered** element rather than out of the component's source,
 * so a tone map that changes without its contrast being rechecked fails here,
 * and a test cannot pass on a pairing the component no longer uses.
 *
 * Two pairings are deliberately still failing and are pinned rather than
 * fixed; see `KNOWN_EXEMPTIONS` below.
 */

/** WCAG 2.x relative luminance. */
function luminance(hex: string): number {
  const channel = (offset: number) => {
    const raw = parseInt(hex.slice(offset, offset + 2), 16) / 255;

    return raw <= 0.04045 ? raw / 12.92 : Math.pow((raw + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG 2.x contrast ratio, 1:1 to 21:1. */
function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);

  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function hexOf(token: string): string {
  const value = COLOR_UTILITIES[token];
  if (value === undefined) {
    throw new Error(`'${token}' is not a colour utility — see COLOR_UTILITIES in the tokens lib.`);
  }
  if (!/^#[0-9a-f]{6}$/i.test(value)) {
    // Only `--scrim` is not an opaque hex, and nothing draws text on it. If
    // that changes, the ratio has to account for what shows through.
    throw new Error(
      `'${token}' is ${value}, not an opaque hex — contrast is undefined against it.`
    );
  }

  return value;
}

function ratioOf(foregroundToken: string, backgroundToken: string): number {
  return contrastRatio(hexOf(foregroundToken), hexOf(backgroundToken));
}

/**
 * The colour tokens an element carries *unconditionally*. Variant classes
 * (`hover:`, `checked:`, ...) apply in a different state and are excluded, the
 * same way `disabled-styling.spec.tsx` excludes them.
 *
 * `bg-transparent` and an element with no background at all both resolve to
 * `bg`: every one of these primitives is drawn on the page surface.
 */
function colorsOf(element: HTMLElement): { foreground: string; background: string } {
  const classes = element.className.split(/\s+/).filter((cls) => cls && !cls.includes(':'));
  const tokenAfter = (prefix: string) =>
    classes
      .filter((cls) => cls.startsWith(prefix))
      .map((cls) => cls.slice(prefix.length))
      .find((token) => token in COLOR_UTILITIES);

  return {
    foreground: tokenAfter('text-') ?? 'fg',
    background: tokenAfter('bg-') ?? 'bg',
  };
}

function ratioFor(element: HTMLElement): number {
  const { foreground, background } = colorsOf(element);

  return ratioOf(foreground, background);
}

/** WCAG 2.1 AA for text below 18px (or below 14px bold) — everything here. */
const AA_NORMAL_TEXT = 4.5;

/**
 * The two colour pairs the design owns, both still below AA and both left
 * alone on purpose: `plan.md` makes the visual design the source of truth
 * where it and this lib disagree, so changing either is a designer's call, not
 * a fix.
 *
 * Keyed on the two **hexes**, not on the token names, because each pair is
 * spelled more than one way and reaches the screen in more than one place —
 * white-on-red is `--fg-on-dark` on `--danger` in the toast's danger glyph and
 * on the danger button's hover, and red-on-white is `--danger` on `--bg` in
 * every form error message; all three are the same #E5484D/#FFFFFF pair at the
 * same 3.91:1. A name-keyed list would have caught one of them and quietly
 * missed the others.
 *
 * They are pinned to their measured ratio rather than merely skipped, so a
 * token edit that changes the number breaks this test and forces the record to
 * be revisited. See
 * `doc/decision/0265-two-below-aa-pairings-the-design-owns-are-pinned-not-fixed.md`,
 * which carries the alternative (`--brand-blue-700`, 4.90:1 on white) and what
 * the designer is being asked to decide.
 */
const KNOWN_EXEMPTIONS: { label: string; hexes: [string, string]; ratio: number }[] = [
  {
    label: '--fg-on-blue on --brand-blue (primary CTA, toast info glyph)',
    hexes: ['#FFFFFF', '#008FFF'],
    ratio: 3.3,
  },
  {
    label: '--danger against --bg, either way round (form errors, toast danger glyph)',
    hexes: ['#E5484D', '#FFFFFF'],
    ratio: 3.91,
  },
];

const isExempt = (element: HTMLElement) => {
  const { foreground, background } = colorsOf(element);
  const drawn = [hexOf(foreground).toUpperCase(), hexOf(background).toUpperCase()].sort();

  return KNOWN_EXEMPTIONS.some((pair) => {
    const known = pair.hexes.map((hex) => hex.toUpperCase()).sort();

    return known[0] === drawn[0] && known[1] === drawn[1];
  });
};

describe('colour contrast of the pairings this lib chooses', () => {
  it('agrees with the values the review measured, so the formula itself is not the thing under test', () => {
    // Three of the six failures the final review reported, recomputed here.
    expect(ratioOf('brand-green-700', 'brand-green-100')).toBeCloseTo(2.31, 2);
    expect(ratioOf('brand-blue', 'brand-blue-100')).toBeCloseTo(2.88, 2);
    expect(ratioOf('fg-on-green', 'brand-green')).toBeCloseTo(1.88, 2);
  });

  it.each<BadgeTone>(['neutral', 'info', 'success', 'warning', 'danger'])(
    'Badge tone=%s clears AA',
    (tone) => {
      render(<Badge tone={tone}>Volno</Badge>);

      expect(ratioFor(screen.getByText('Volno'))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  );

  it.each<AvatarTone>(['dark', 'info', 'neutral', 'warning'])(
    'Avatar tone=%s clears AA',
    (tone) => {
      render(<Avatar tone={tone} initials="KZ" label="Karel Zíbar" />);

      expect(ratioFor(screen.getByRole('img', { name: 'Karel Zíbar' }))).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT
      );
    }
  );

  it.each<ToastTone>(['neutral', 'info', 'success', 'warning', 'danger'])(
    'Toast tone=%s clears AA, glyph chip included',
    (tone) => {
      const { container } = render(
        <Toast tone={tone} icon="!">
          Rezervace potvrzena
        </Toast>
      );
      const glyph = screen.getByText('!');
      const surface = container.firstElementChild as HTMLElement;

      expect(ratioFor(surface)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      // The glyph sits on its own chip, so it does not inherit the surface.
      // `info` and `danger` draw theirs on the saturated brand blue and the
      // danger red — the two pinned pairs, reached here by a second route.
      if (!isExempt(glyph)) {
        expect(ratioFor(glyph)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      }
    }
  );

  it("Modal's eyebrow clears AA", () => {
    // Its tint is spelled `--brand-light`, which is the same #E2F2FF as
    // `--brand-blue-100`. Blue-on-it was the same 2.88:1 as the `info` badge,
    // under a different token name — which is why this test resolves colours to
    // values rather than comparing names.
    render(
      <Modal open onClose={() => undefined} title="Nastavení" eyebrow="Otevřeno" hideCloseButton>
        <p>Obsah</p>
      </Modal>
    );

    expect(ratioFor(screen.getByText('Otevřeno'))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it.each<ButtonVariant>(['primary', 'secondary', 'outline', 'danger', 'ghost'])(
    'Button variant=%s clears AA, unless it is a pinned exemption',
    (variant) => {
      render(<Button variant={variant}>Uložit</Button>);
      const button = screen.getByRole('button', { name: 'Uložit' });

      if (isExempt(button)) {
        expect(variant).toBe('primary');

        return;
      }

      expect(ratioFor(button)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  );

  it('the pinned exemptions still measure exactly what the decision record says', () => {
    for (const pair of KNOWN_EXEMPTIONS) {
      expect({
        label: pair.label,
        ratio: Number(contrastRatio(pair.hexes[0], pair.hexes[1]).toFixed(2)),
      }).toEqual({ label: pair.label, ratio: pair.ratio });
    }
  });

  it('names the alternative the decision record asks the designer to rule on', () => {
    // `--brand-blue-700` #0070D6 would carry the CTA at 4.90:1 on white, in
    // both directions. The review's report says 4.72:1; recomputed here.
    expect(ratioOf('brand-blue-700', 'bg')).toBeCloseTo(4.9, 2);
    expect(ratioOf('fg-on-blue', 'brand-blue-700')).toBeCloseTo(4.9, 2);
  });

  it('the form error message is the exempt pairing, and nothing else about it changed', () => {
    render(<Input label="SPZ" error="Vyplňte SPZ" />);

    expect(isExempt(screen.getByRole('alert'))).toBe(true);
  });

  /**
   * Disabled text is exempt from WCAG 1.4.3, so AA does not apply — but a label
   * nobody can read is still a defect, and at `--border-strong` on `--bg-muted`
   * it measured 1.38:1. The floor here is 3:1, the AA threshold for non-text
   * user-interface components, which `--fg-3` (4.40:1) clears comfortably while
   * still reading as inactive.
   */
  const DISABLED_FLOOR = 3;

  it('a disabled Button stays readable', () => {
    render(<Button disabled>Uložit</Button>);

    expect(ratioFor(screen.getByRole('button', { name: 'Uložit' }))).toBeGreaterThanOrEqual(
      DISABLED_FLOOR
    );
  });

  it('a disabled Stepper keeps its value and both step buttons readable', () => {
    render(<Stepper label="Počet" min={0} max={10} defaultValue={5} disabled />);

    for (const name of ['Snížit', 'Zvýšit']) {
      expect(ratioFor(screen.getByRole('button', { name }))).toBeGreaterThanOrEqual(DISABLED_FLOOR);
    }
    expect(ratioFor(screen.getByRole('spinbutton', { name: 'Počet' }))).toBeGreaterThanOrEqual(
      DISABLED_FLOOR
    );
  });
});
