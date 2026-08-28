/**
 * Car color palette.
 *
 * NOT part of the general Shoptet DS palette in `colors_and_type.css` — this
 * triple comes from `plan.md` and is documented in `doc/design/README.md` as
 * scoped *only* to the color of car icons drawn on occupied parking spots.
 * Every other UI surface (buttons, badges, status, text, ...) must keep using
 * `COLORS` from `colors.ts`. Do not add these values to the general scale, and
 * do not use the general scale's colors here.
 *
 * The design assigns a color deterministically per user (e.g. by hashing a
 * user id against this array), never randomly — a car must keep the same
 * color across renders. That mapping is domain logic (it needs a notion of
 * "user"), so it does not live in the design system; only the raw palette
 * does. Consumers pick an index deterministically and index into this array.
 */
export const CAR_COLOR_PALETTE = ['#fcaf00', '#00e25a', '#3b88ff'] as const;
