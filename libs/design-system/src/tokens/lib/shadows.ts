/**
 * Shadow scale (soft, low-contrast, not glossy). 1:1 with `--shadow-*` in
 * `colors_and_type.css`. `blue`/`yellow` are hover glows for the matching CTA
 * color, not part of the xs → lg elevation ramp.
 */
export const SHADOWS = {
  xs: '0 1px 2px rgba(35,34,31,0.04)',
  sm: '0 2px 6px rgba(35,34,31,0.06)',
  md: '0 8px 24px rgba(35,34,31,0.08)',
  lg: '0 20px 48px rgba(35,34,31,0.12)',
  blue: '0 12px 28px rgba(0,143,255,0.35)',
  yellow: '0 12px 28px rgba(255,190,14,0.35)',
} as const;
