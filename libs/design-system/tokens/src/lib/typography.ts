/**
 * Typography tokens: font families, font-face sources, type scale, line
 * heights and letter spacing. 1:1 with `doc/design/ds/colors_and_type.css`.
 */

/** Font family stacks. `sans` leads with the brand font, falls back sanely without it. */
export const FONT_FAMILIES = {
  sans: [
    'NHaasGroteskDS',
    'Neue Haas Grotesk',
    'Helvetica Neue',
    'Inter',
    'Arial',
    'system-ui',
    'sans-serif',
  ] as const,
  mono: ['ui-monospace', 'SF Mono', 'JetBrains Mono', 'Menlo', 'monospace'] as const,
} as const;

/**
 * `@font-face` sources for the brand font, "NHaasGroteskDS" (Neue Haas
 * Grotesk Display Pro). Files are copied verbatim into `assets/fonts/` from
 * `doc/design/ds/fonts/`.
 *
 * `colors_and_type.css` declares 9 `@font-face` rules (weight 700 italic,
 * "76BdIt", included), but `doc/design/ds/fonts/` only ships 8 files —
 * `NHaasGroteskDSPro-76BdIt.otf` was never exported (`doc/design/README.md`
 * itself says "8 řezů"). Declaring an `@font-face` for a file that doesn't
 * exist would 404 in the browser for no benefit, so that one entry is
 * deliberately dropped here rather than copied 1:1 — see
 * `doc/decision/0012-otf-fonty-commitnute-bez-overene-licence.md`. Bold
 * italic text still renders (browser synthesizes italic from weight 700
 * normal), it just isn't the true drawn italic.
 *
 * Licensing: Neue Haas Grotesk Display Pro's license for production use has
 * NOT been verified (flagged in `doc/design/README.md`). These files are kept
 * for design fidelity in development; `FONT_FAMILIES.sans` always falls back
 * to widely-licensed fonts, so the app renders correctly without them.
 */
export const FONT_FACES = [
  { weight: 250, style: 'normal', file: 'NHaasGroteskDSPro-25Th.otf' },
  { weight: 300, style: 'normal', file: 'NHaasGroteskDSPro-35XLt.otf' },
  { weight: 350, style: 'normal', file: 'NHaasGroteskDSPro-45Lt.otf' },
  { weight: 400, style: 'normal', file: 'NHaasGroteskDSPro-55Rg.otf' },
  { weight: 400, style: 'italic', file: 'NHaasGroteskDSPro-56It.otf' },
  { weight: 500, style: 'normal', file: 'NHaasGroteskDSPro-65Md.otf' },
  { weight: 700, style: 'normal', file: 'NHaasGroteskDSPro-75Bd.otf' },
  // NOTE: no weight-700-italic entry — see comment above, file was never exported.
  { weight: 900, style: 'normal', file: 'NHaasGroteskDSPro-95Blk.otf' },
] as const satisfies ReadonlyArray<{
  weight: number;
  style: 'normal' | 'italic';
  file: string;
}>;

/** Type scale (mobile-first; `colors_and_type.css` bumps some via clamp() at the semantic-type layer, not here). */
export const FONT_SIZES = {
  xs: '12px',
  sm: '14px',
  base: '16px',
  md: '18px',
  lg: '20px',
  xl: '24px',
  '2xl': '32px',
  '3xl': '40px',
  '4xl': '56px',
  '5xl': '72px',
  '6xl': '96px',
} as const;

/** Line heights. */
export const LINE_HEIGHTS = {
  tight: '1.05',
  snug: '1.15',
  normal: '1.4',
  loose: '1.6',
} as const;

/** Letter spacing (tracking). */
export const LETTER_SPACING = {
  tight: '-0.02em',
  snug: '-0.01em',
  normal: '0',
  wide: '0.04em',
  caps: '0.08em',
} as const;

export const TYPOGRAPHY = {
  families: FONT_FAMILIES,
  faces: FONT_FACES,
  fontSize: FONT_SIZES,
  lineHeight: LINE_HEIGHTS,
  letterSpacing: LETTER_SPACING,
} as const;
