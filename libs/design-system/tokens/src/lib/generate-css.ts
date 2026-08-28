import type { DesignTokens } from './tokens';

/**
 * Renders `DESIGN_TOKENS` to the CSS custom-property file the design system
 * ships (`assets/tokens.css`). Every `--name` here is written out explicitly
 * (no reflection over object keys) so a reviewer can diff this function
 * against `colors_and_type.css` line by line.
 *
 * This is a pure function of its input — no filesystem access — so it can be
 * called both by `scripts/build-tokens-css.ts` (to write the file) and by
 * `generate-css.spec.ts` (to prove the written file is still current).
 */
export function generateTokensCss(tokens: DesignTokens): string {
  const { colors, carColorPalette, typography, spacing, radius, shadows, motion, layout } = tokens;
  const { brand, neutral, surface, fg, line, status } = colors;
  const { families, faces, fontSize, lineHeight, letterSpacing } = typography;

  const fontFaceBlocks = faces
    .map(
      (face) => `@font-face {
  font-family: "NHaasGroteskDS";
  font-weight: ${face.weight};
  font-style: ${face.style};
  font-display: swap;
  src: url("./fonts/${face.file}") format("opentype");
}`
    )
    .join('\n');

  const quoteIfMultiWord = (name: string) => (name.includes(' ') ? `"${name}"` : name);
  const fontSansValue = families.sans.map(quoteIfMultiWord).join(', ');
  const fontMonoValue = families.mono.map(quoteIfMultiWord).join(', ');

  const rootBlock = `:root {
  /* --- Brand color palette --- */
  --brand-blue: ${brand.blue};
  --brand-green: ${brand.green};
  --brand-yellow: ${brand.yellow};
  --brand-light: ${brand.light};
  --brand-dark: ${brand.dark};
  --brand-black: ${brand.black};

  --text: ${brand.text};

  --brand-blue-700: ${brand.blue700};
  --brand-green-700: ${brand.green700};
  --brand-yellow-700: ${brand.yellow700};

  --brand-blue-100: ${brand.blue100};
  --brand-green-100: ${brand.green100};
  --brand-yellow-100: ${brand.yellow100};

  /* --- Neutrals --- */
  --neutral-0: ${neutral[0]};
  --neutral-50: ${neutral[50]};
  --neutral-100: ${neutral[100]};
  --neutral-200: ${neutral[200]};
  --neutral-300: ${neutral[300]};
  --neutral-400: ${neutral[400]};
  --neutral-500: ${neutral[500]};
  --neutral-600: ${neutral[600]};
  --neutral-700: ${neutral[700]};
  --neutral-800: ${neutral[800]};
  --neutral-900: ${neutral[900]};
  --neutral-950: ${neutral[950]};

  /* --- Semantic surfaces --- */
  --bg: ${surface.bg};
  --bg-soft: ${surface.bgSoft};
  --bg-muted: ${surface.bgMuted};
  --bg-inverse: ${surface.bgInverse};

  /* --- Semantic foreground --- */
  --fg: ${fg.fg};
  --fg-2: ${fg.fg2};
  --fg-3: ${fg.fg3};
  --fg-on-yellow: ${fg.onYellow};
  --fg-on-green: ${fg.onGreen};
  --fg-on-blue: ${fg.onBlue};
  --fg-on-light: ${fg.onLight};
  --fg-on-dark: ${fg.onDark};

  /* --- Lines --- */
  --border: ${line.border};
  --border-strong: ${line.borderStrong};
  --divider: ${line.divider};

  /* --- Status --- */
  --success: ${status.success};
  --info: ${status.info};
  --warning: ${status.warning};
  --danger: ${status.danger};
  --danger-100: ${status.danger100};

  /* --- Car color palette ---
     Scoped ONLY to car icons on occupied parking spots — see car-palette.ts.
     Deliberately namespaced away from the general palette above. */
  --palette-car-1: ${carColorPalette[0]};
  --palette-car-2: ${carColorPalette[1]};
  --palette-car-3: ${carColorPalette[2]};

  /* --- Type families --- */
  --font-sans: ${fontSansValue};
  --font-mono: ${fontMonoValue};

  /* --- Type scale --- */
  --fs-xs: ${fontSize.xs};
  --fs-sm: ${fontSize.sm};
  --fs-base: ${fontSize.base};
  --fs-md: ${fontSize.md};
  --fs-lg: ${fontSize.lg};
  --fs-xl: ${fontSize.xl};
  --fs-2xl: ${fontSize['2xl']};
  --fs-3xl: ${fontSize['3xl']};
  --fs-4xl: ${fontSize['4xl']};
  --fs-5xl: ${fontSize['5xl']};
  --fs-6xl: ${fontSize['6xl']};

  /* --- Line heights --- */
  --lh-tight: ${lineHeight.tight};
  --lh-snug: ${lineHeight.snug};
  --lh-normal: ${lineHeight.normal};
  --lh-loose: ${lineHeight.loose};

  /* --- Letter spacing --- */
  --tracking-tight: ${letterSpacing.tight};
  --tracking-snug: ${letterSpacing.snug};
  --tracking-normal: ${letterSpacing.normal};
  --tracking-wide: ${letterSpacing.wide};
  --tracking-caps: ${letterSpacing.caps};

  /* --- Spacing scale (4px base) --- */
  --space-1: ${spacing[1]};
  --space-2: ${spacing[2]};
  --space-3: ${spacing[3]};
  --space-4: ${spacing[4]};
  --space-5: ${spacing[5]};
  --space-6: ${spacing[6]};
  --space-8: ${spacing[8]};
  --space-10: ${spacing[10]};
  --space-12: ${spacing[12]};
  --space-16: ${spacing[16]};
  --space-20: ${spacing[20]};
  --space-24: ${spacing[24]};
  --space-32: ${spacing[32]};

  /* --- Radii --- */
  --radius-photos: ${radius.photos};
  --radius-xs: ${radius.xs};
  --radius-sm: ${radius.sm};
  --radius-md: ${radius.md};
  --radius-lg: ${radius.lg};
  --radius-xl: ${radius.xl};
  --radius-cta: ${radius.cta};
  --radius-pill: ${radius.pill};

  /* --- Shadows --- */
  --shadow-xs: ${shadows.xs};
  --shadow-sm: ${shadows.sm};
  --shadow-md: ${shadows.md};
  --shadow-lg: ${shadows.lg};
  --shadow-blue: ${shadows.blue};
  --shadow-yellow: ${shadows.yellow};

  /* --- Motion --- */
  --ease-out: ${motion.easing.out};
  --ease-in-out: ${motion.easing.inOut};
  --dur-fast: ${motion.duration.fast};
  --dur-base: ${motion.duration.base};
  --dur-slow: ${motion.duration.slow};

  /* --- Layout --- */
  --container: ${layout.container.base};
  --container-wide: ${layout.container.wide};
}`;

  return `/* ============================================================
   GENERATED FILE — do not hand-edit.
   Source: libs/design-system/tokens/src/lib/*.ts (DESIGN_TOKENS).
   Regenerate with: npx nx run design-system-tokens:generate-css
   ============================================================ */

/* ---------- Web fonts (Neue Haas Grotesk Display Pro) ---------- */
${fontFaceBlocks}

/* ---------- Tokens ---------- */
${rootBlock}
`;
}
