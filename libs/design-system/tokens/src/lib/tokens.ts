import { CAR_COLOR_PALETTE } from './car-palette';
import { COLORS } from './colors';
import { LAYOUT } from './layout';
import { MOTION } from './motion';
import { RADIUS } from './radius';
import { SHADOWS } from './shadows';
import { SPACING } from './spacing';
import { TYPOGRAPHY } from './typography';

/**
 * Every design token, as a single nested object. This is the one TypeScript
 * source of truth: `generate-css.ts` renders it to `assets/tokens.css`, and
 * the drift test in `generate-css.spec.ts` proves the committed CSS file
 * still matches what this object renders to.
 */
export const DESIGN_TOKENS = {
  colors: COLORS,
  carColorPalette: CAR_COLOR_PALETTE,
  typography: TYPOGRAPHY,
  spacing: SPACING,
  radius: RADIUS,
  shadows: SHADOWS,
  motion: MOTION,
  layout: LAYOUT,
} as const;

export type DesignTokens = typeof DESIGN_TOKENS;
