import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { generateTokensCss } from './generate-css';
import { DESIGN_TOKENS } from './tokens';

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
    const committed = readFileSync(join(__dirname, '../../assets/tokens.css'), 'utf-8');
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

  it('emits one @font-face rule per font file', () => {
    const css = generateTokensCss(DESIGN_TOKENS);
    const matches = css.match(/@font-face/g) ?? [];

    expect(matches).toHaveLength(DESIGN_TOKENS.typography.faces.length);
  });

  it('every declared font face file actually exists in assets/fonts', () => {
    for (const face of DESIGN_TOKENS.typography.faces) {
      const fontPath = join(__dirname, '../../assets/fonts', face.file);
      expect(existsSync(fontPath)).toBe(true);
    }
  });
});
