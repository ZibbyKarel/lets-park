/**
 * Motion tokens (easing + duration). 1:1 with `--ease-*` / `--dur-*` in
 * `colors_and_type.css`.
 */
export const EASING = {
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
} as const;

export const DURATION = {
  fast: '120ms',
  base: '200ms',
  slow: '360ms',
} as const;

export const MOTION = {
  easing: EASING,
  duration: DURATION,
} as const;
