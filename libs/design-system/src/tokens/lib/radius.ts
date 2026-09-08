/**
 * Border radius scale. 1:1 with `--radius-*` in `colors_and_type.css`.
 *
 * `photos` is reserved for photographic crops; `cta` (pill) is for every
 * call-to-action button. Graphic elements use the xs → xl ramp. `pill` is an
 * alias of `cta`, exactly as in the source CSS.
 */
export const RADIUS = {
  photos: '2px',
  xs: '8px',
  sm: '12px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  cta: '360px',
  /** Alias of `cta`. */
  pill: '360px',
} as const;
