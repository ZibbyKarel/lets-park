/**
 * Typography tokens: font families, font-face sources, type scale, line
 * heights and letter spacing. 1:1 with `doc/design/ds/colors_and_type.css`.
 */

/**
 * One entry in a `font-family` stack.
 *
 * `quoted` is copied per entry from the source CSS, never derived from the
 * name. No rule reproduces `colors_and_type.css`: it quotes `"Arial"` and
 * `"Inter"` (single words) but leaves `Menlo` (also a single word) bare, and
 * leaves the generic families (`system-ui`, `sans-serif`, `ui-monospace`,
 * `monospace`) bare too. Storing the flag keeps `assets/tokens.css`
 * byte-faithful to the source by construction instead of by heuristic.
 */
export interface FontFamilyEntry {
  /** Family name, without quotes. */
  readonly name: string;
  /** Whether the source CSS wraps this name in double quotes. */
  readonly quoted: boolean;
}

/** Font family stacks. `sans` leads with the brand font, falls back sanely without it. */
export const FONT_FAMILIES = {
  sans: [
    { name: 'NHaasGroteskDS', quoted: true },
    { name: 'Neue Haas Grotesk', quoted: true },
    { name: 'Helvetica Neue', quoted: true },
    { name: 'Inter', quoted: true },
    { name: 'Arial', quoted: true },
    { name: 'system-ui', quoted: false },
    { name: 'sans-serif', quoted: false },
  ],
  mono: [
    { name: 'ui-monospace', quoted: false },
    { name: 'SF Mono', quoted: true },
    { name: 'JetBrains Mono', quoted: true },
    { name: 'Menlo', quoted: false },
    { name: 'monospace', quoted: false },
  ],
} as const satisfies Record<string, ReadonlyArray<FontFamilyEntry>>;

/**
 * Renders a family stack exactly as the source CSS writes it — the quoting of
 * each name comes from the token data, not from inspecting the name.
 */
export function fontStack(entries: readonly FontFamilyEntry[]): string {
  return entries.map((entry) => (entry.quoted ? `"${entry.name}"` : entry.name)).join(', ');
}

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
 * `doc/decision/0010-otf-fonty-commitnute-bez-overene-licence.md`. Bold
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
