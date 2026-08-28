/**
 * Car color palette.
 *
 * NOT part of the general Shoptet DS palette in `colors_and_type.css` — this
 * triple comes from `plan.md` and is documented in `doc/design/README.md` as
 * scoped *only* to the vehicle glyphs the app draws on its map surface. Every
 * other UI surface (buttons, badges, status, text, ...) must keep using
 * `COLORS` from `colors.ts`. Do not add these values to the general scale, and
 * do not use the general scale's colors here.
 *
 * The consumer assigns a color deterministically per subject (e.g. by hashing
 * an id against this array), never randomly — a glyph must keep the same color
 * across renders. That mapping needs to know what the subject *is*, which is
 * knowledge the design system does not have; only the raw palette lives here.
 * Consumers pick an index deterministically and index into this array.
 */
export const CAR_COLOR_PALETTE = ['#fcaf00', '#00e25a', '#3b88ff'] as const;
