/**
 * Layout tokens: content container widths (1:1 with `--container*` in
 * `colors_and_type.css`) and responsive breakpoints.
 */
export const CONTAINER = {
  base: '1200px',
  wide: '1320px',
} as const;

/**
 * DERIVED — not present in `colors_and_type.css`. The source file defines no
 * `--breakpoint-*` custom properties at all; the design (screens in
 * `doc/design/screens/`) only shows discrete layouts, not the intermediate
 * viewport widths where they switch. These values are Tailwind v4's own
 * defaults, chosen because they comfortably straddle the two container widths
 * above (`sm`/`md` for the mobile→tablet range below both containers, `xl`
 * sitting between `--container` and `--container-wide`, `2xl` above both).
 * Revisit if/when the design defines explicit breakpoints.
 */
export const BREAKPOINTS = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

export const LAYOUT = {
  container: CONTAINER,
  breakpoint: BREAKPOINTS,
} as const;
