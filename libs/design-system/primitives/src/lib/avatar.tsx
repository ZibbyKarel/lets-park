import type { HTMLAttributes } from 'react';

import { cx } from './cx';

export type AvatarTone = 'dark' | 'info' | 'neutral' | 'warning';
export type AvatarSize = 'sm' | 'md' | 'lg';

const TONE_CLASSES: Record<AvatarTone, string> = {
  dark: 'bg-bg-inverse text-fg-on-dark',
  info: 'bg-brand-blue-100 text-brand-blue',
  neutral: 'bg-bg-muted text-fg-2',
  warning: 'bg-brand-yellow-100 text-fg-on-yellow',
};

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: 'size-6 text-xs',
  md: 'size-8 text-xs',
  lg: 'size-10 text-sm',
};

export interface AvatarProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /**
   * The one or two characters drawn in the circle. The design system does not
   * derive these — computing initials needs to know what a name is, which is
   * domain knowledge that lives in the app.
   */
  initials: string;
  /**
   * Accessible name. Without it the avatar is treated as decorative and hidden
   * from assistive technology, on the assumption that the name it stands for is
   * already written next to it.
   */
  label?: string | undefined;
  /** Colour pair. Defaults to `neutral`. */
  tone?: AvatarTone | undefined;
  /** Diameter step. Defaults to `md`. */
  size?: AvatarSize | undefined;
}

/** Circular initials chip. */
export function Avatar({
  initials,
  label,
  tone = 'neutral',
  size = 'md',
  className,
  ...rest
}: AvatarProps) {
  const labelling = label
    ? ({ role: 'img', 'aria-label': label } as const)
    : ({ 'aria-hidden': true } as const);

  return (
    <span
      {...rest}
      {...labelling}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-cta font-bold uppercase select-none',
        SIZE_CLASSES[size],
        TONE_CLASSES[tone],
        className
      )}
    >
      {initials}
    </span>
  );
}
