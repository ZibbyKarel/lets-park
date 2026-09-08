import { forwardRef, type HTMLAttributes } from 'react';

import { cx } from '../cx';
import { type Padding, resolvePadding } from '../padding';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Defaults to `6` (`p-6`). `padding={0}` renders the panel with no inner
   * padding, matching the `flex flex-col rounded-lg border border-border
   * bg-bg` panel at `admin-window-screen.tsx:152` — a bordered section whose
   * header/list children each manage their own spacing.
   */
  padding?: Padding | undefined;
}

/**
 * Bordered panel, replacing the repeated
 * `rounded-lg border border-border bg-bg p-6` (`admin-window-screen.tsx:109`,
 * and the `padding={0}` case at `admin-window-screen.tsx:152`, which omits
 * the trailing `p-6`).
 *
 * `rounded-lg` here resolves to the `--radius-lg` token (24px via
 * `theme.css`), not Tailwind's stock 8px `lg` — same class, different value,
 * because `theme.css` remaps the `--radius-*` namespace.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = 6, className, children, ...rest },
  ref
) {
  return (
    <div
      {...rest}
      ref={ref}
      className={cx(
        'rounded-lg border border-border bg-bg',
        resolvePadding(padding, 'p'),
        className
      )}
    >
      {children}
    </div>
  );
});
