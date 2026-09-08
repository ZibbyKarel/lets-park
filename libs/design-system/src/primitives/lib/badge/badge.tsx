import type { HTMLAttributes } from 'react';

import { cx } from '../cx';

/**
 * Badge colour pairs, straight off the design's status pills. Each tone is a
 * tint background with a darker foreground — never a saturated fill.
 *
 * **The tint carries the tone; the text does not.** Badge copy is 12px, so
 * WCAG 2.1 AA wants 4.5:1, and the design's own saturated hues do not reach it
 * on their matching 100-level tint — measured from `assets/tokens.css`:
 * `--brand-green-700` on `--brand-green-100` is 2.31:1, `--brand-blue` on
 * `--brand-blue-100` is 2.88:1, `--danger` on `--danger-100` is 3.26:1, and
 * even the `-700` step does not rescue them (`--brand-blue-700` on the blue
 * tint is 4.29:1, `--brand-yellow-700` on the yellow tint 1.93:1). So every
 * tone reads its text off the neutral foreground scale and lets the background
 * say which tone it is: `--fg-2` on each tint is 8.69–9.50:1, and `warning`
 * keeps `--fg-on-yellow` (14.49:1), the token the design pairs with yellow.
 *
 * See `doc/decision/0266-badge-avatar-and-toast-read-their-text-off-the-neutral-scale.md`.
 */
export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-bg-muted text-fg-2',
  info: 'bg-brand-blue-100 text-fg-2',
  success: 'bg-brand-green-100 text-fg-2',
  warning: 'bg-brand-yellow-100 text-fg-on-yellow',
  danger: 'bg-danger-100 text-fg-2',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Colour pair. Defaults to `neutral`. */
  tone?: BadgeTone | undefined;
}

/**
 * Small pill label for a state or a count.
 *
 * Purely decorative markup — a `<span>` with no role. When the badge carries
 * information that is not repeated in nearby text, the caller is responsible
 * for exposing it (an `aria-label` on the surrounding element, or a visually
 * hidden sentence); a badge cannot know that on its own.
 */
export function Badge({ tone = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span
      {...rest}
      className={cx(
        'inline-flex h-6 items-center rounded-cta px-3 text-xs font-bold whitespace-nowrap',
        TONE_CLASSES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
