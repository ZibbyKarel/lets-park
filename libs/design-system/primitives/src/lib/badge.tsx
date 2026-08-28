import type { HTMLAttributes } from 'react';

import { cx } from './cx';

/**
 * Badge colour pairs, straight off the design's status pills. Each tone is a
 * tint background with its own darker foreground — never a saturated fill.
 */
export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-bg-muted text-fg-2',
  info: 'bg-brand-blue-100 text-brand-blue',
  success: 'bg-brand-green-100 text-brand-green-700',
  warning: 'bg-brand-yellow-100 text-fg-on-yellow',
  danger: 'bg-danger-100 text-danger',
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
