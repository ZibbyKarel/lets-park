/**
 * Color tokens.
 *
 * Source of truth: `doc/design/ds/colors_and_type.css` (Shoptet Design System —
 * Foundations). Every value here is copied 1:1 from that file's `:root` block —
 * do not round, rename, or "improve" any hex value. If the source file changes,
 * update this file to match, in the same commit.
 *
 * `COLORS` below is the general, domain-free UI palette used everywhere in the
 * design system (brand colors, neutrals, semantic surfaces/foreground/status).
 * It intentionally does NOT include the three-color "car palette" — that one is
 * a separate, narrowly-scoped token group, see `car-palette.ts`.
 */

/** Brand palette. Order when colors appear together: blue → green → yellow → light-blue → dark. */
export const BRAND_COLORS = {
  blue: '#008FFF',
  green: '#00DB33',
  yellow: '#FFBE0E',
  light: '#E2F2FF',
  dark: '#23221F',
  /** Legacy alias for `dark` — kept because colors_and_type.css keeps it too. */
  black: '#23221F',

  /** Primary text color — slightly cooler/darker than `dark`. Body, headings, nav. */
  text: '#15181E',

  /** Hover tints (slightly darker). */
  blue700: '#0070D6',
  green700: '#00B82A',
  yellow700: '#E5A800',

  /** Light tints (badges, soft backgrounds). */
  blue100: '#E2F2FF', // same value as `light`
  green100: '#D2F8DC',
  yellow100: '#FFF4D2',
} as const;

/** Neutral gray scale (warm-cool), 0 (white) through 950 (near-black, official brand dark). */
export const NEUTRAL_COLORS = {
  0: '#FFFFFF',
  50: '#FAFAFA',
  100: '#F4F4F5',
  200: '#E7E7EA',
  300: '#D1D1D6',
  400: '#A1A1AA',
  500: '#71717A',
  600: '#52525B',
  700: '#3F3F46',
  800: '#27272A',
  900: '#18181B',
  950: '#23221F',
} as const;

/** Semantic surface colors. */
export const SURFACE_COLORS = {
  bg: NEUTRAL_COLORS[0],
  bgSoft: NEUTRAL_COLORS[50],
  bgMuted: NEUTRAL_COLORS[100],
  bgInverse: BRAND_COLORS.dark,
} as const;

/** Semantic foreground (text-on-X) colors. */
export const FOREGROUND_COLORS = {
  fg: BRAND_COLORS.text,
  fg2: NEUTRAL_COLORS[700],
  fg3: NEUTRAL_COLORS[500],
  onYellow: BRAND_COLORS.dark,
  onGreen: NEUTRAL_COLORS[0],
  onBlue: NEUTRAL_COLORS[0],
  onLight: BRAND_COLORS.dark,
  onDark: NEUTRAL_COLORS[0],
} as const;

/** Border / divider lines. */
export const LINE_COLORS = {
  border: NEUTRAL_COLORS[200],
  borderStrong: NEUTRAL_COLORS[300],
  divider: NEUTRAL_COLORS[100],
} as const;

/** Status colors. `info` intentionally doubles as the primary brand color. */
export const STATUS_COLORS = {
  success: BRAND_COLORS.green,
  info: BRAND_COLORS.blue,
  warning: BRAND_COLORS.yellow,
  danger: '#E5484D',
  danger100: '#FCE5E5',
} as const;

/** Every general-palette color, grouped, for consumers that want the whole tree. */
export const COLORS = {
  brand: BRAND_COLORS,
  neutral: NEUTRAL_COLORS,
  surface: SURFACE_COLORS,
  fg: FOREGROUND_COLORS,
  line: LINE_COLORS,
  status: STATUS_COLORS,
} as const;
