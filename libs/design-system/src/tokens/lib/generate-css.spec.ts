import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { generateTokensCss } from './generate-css';
import { DESIGN_TOKENS, type DesignTokens } from './tokens';

/**
 * Guards against TS tokens and the committed `assets/tokens.css` drifting
 * apart. `assets/tokens.css` is committed (see `doc/design-system.md`) so
 * consumers don't need a build step to get CSS variables; this test is what
 * makes that safe — it fails the moment someone edits the TS tokens (or the
 * generator) without regenerating the file, or hand-edits the CSS file
 * without updating the TS source.
 *
 * This is a golden-file comparison against the actual committed file, not a
 * Jest inline snapshot — an inline snapshot would happily rewrite itself to
 * match a changed generator output and never catch drift from the real file
 * on disk.
 */
describe('generateTokensCss', () => {
  it('matches the committed assets/tokens.css byte-for-byte', () => {
    const committed = readFileSync(join(__dirname, '../../../assets/tokens.css'), 'utf-8');
    const generated = generateTokensCss(DESIGN_TOKENS);

    expect(generated).toBe(committed);
  });

  it('renders every brand color as a CSS custom property', () => {
    const css = generateTokensCss(DESIGN_TOKENS);

    expect(css).toContain('--brand-blue: #008FFF;');
    expect(css).toContain('--danger-100: #FCE5E5;');
  });

  it('keeps the car color palette in its own namespace, separate from the general scale', () => {
    const css = generateTokensCss(DESIGN_TOKENS);

    expect(css).toContain('--palette-car-1: #fcaf00;');
    expect(css).toContain('--palette-car-2: #00e25a;');
    expect(css).toContain('--palette-car-3: #3b88ff;');
    // None of the car colors leak into the brand/neutral namespaces.
    expect(css).not.toMatch(/--(brand|neutral)-\S*:\s*#fcaf00/);
  });

  it('keeps the source CSS alias chains instead of flattening them to literals', () => {
    const css = generateTokensCss(DESIGN_TOKENS);

    // `colors_and_type.css` defines these as references, not values — a future
    // theme re-points the target and every consumer follows.
    expect(css).toContain('--bg: var(--neutral-0);');
    expect(css).toContain('--fg: var(--text);');
    expect(css).toContain('--border: var(--neutral-200);');
    expect(css).toContain('--success: var(--brand-green);');
    expect(css).toContain('--radius-pill: var(--radius-cta);');
    // ...while the tokens the source spells out literally stay literal.
    expect(css).toContain('--danger: #E5484D;');
  });

  it('throws instead of emitting an alias whose target no longer holds the same value', () => {
    // `DesignTokens` is `typeof DESIGN_TOKENS`, so every value is a literal
    // type — a changed hex cannot be expressed without widening. The cast is
    // the point of the test: it simulates the one thing the type system
    // cannot, someone editing a value in `src/lib/*.ts`.
    const drifted = {
      ...DESIGN_TOKENS,
      colors: {
        ...DESIGN_TOKENS.colors,
        surface: { ...DESIGN_TOKENS.colors.surface, bg: '#123456' },
      },
    } as unknown as DesignTokens;

    expect(() => generateTokensCss(drifted)).toThrow(/Token alias drift/);
  });

  it('quotes each font family name exactly as the source CSS does', () => {
    const css = generateTokensCss(DESIGN_TOKENS);

    expect(css).toContain(
      '--font-sans: "NHaasGroteskDS", "Neue Haas Grotesk", "Helvetica Neue", "Inter", "Arial", system-ui, sans-serif;'
    );
    expect(css).toContain(
      '--font-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;'
    );
  });

  it('emits one @font-face rule per font file', () => {
    const css = generateTokensCss(DESIGN_TOKENS);
    const matches = css.match(/@font-face/g) ?? [];

    expect(matches).toHaveLength(DESIGN_TOKENS.typography.faces.length);
  });

  it('every declared font face file actually exists in assets/fonts', () => {
    for (const face of DESIGN_TOKENS.typography.faces) {
      const fontPath = join(__dirname, '../../../assets/fonts', face.file);
      expect(existsSync(fontPath)).toBe(true);
    }
  });
});
