import { forwardRef, type HTMLAttributes } from 'react';

import { cx } from '../cx';
import { type Padding, resolvePadding } from '../padding';

export type BoxBackground = 'bg' | 'bg-soft' | 'bg-muted';
export type BoxRadius = 'sm' | 'md' | 'lg';

/**
 * `bg-{name}` utility literals. These are utility names, not the `SURFACE_COLORS`
 * TS token object in `colors.ts` (whose keys are `bg`/`bgSoft`/`bgMuted`/`bgInverse`):
 * the "Colors" section of `theme.css` maps `--color-bg`/`--color-bg-soft`/
 * `--color-bg-muted` into Tailwind's `@theme`, so `bg-bg`/`bg-bg-soft`/`bg-bg-muted`
 * are the real utilities — there is no `bg-surface`.
 */
const BACKGROUND_CLASSES: Record<BoxBackground, string> = {
  bg: 'bg-bg',
  'bg-soft': 'bg-bg-soft',
  'bg-muted': 'bg-bg-muted',
};

/**
 * `rounded-{step}` utility literals for the subset of `RADIUS`
 * (`libs/design-system/tokens/src/lib/radius.ts`) exposed here. The "Radius"
 * section of `theme.css` maps `--radius-sm`/`--radius-md`/`--radius-lg` into
 * `@theme`, so each of these resolves to its token value, not Tailwind's
 * stock scale.
 */
const RADIUS_CLASSES: Record<BoxRadius, string> = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
};

export interface BoxProps extends HTMLAttributes<HTMLDivElement> {
  /** `p-*`/`py-*`+`px-*`/`pt-*`+`pr-*`+`pb-*`+`pl-*`, see `Padding`. */
  padding?: Padding | undefined;
  /** Same shape as `padding`, applied as margin instead. */
  margin?: Padding | undefined;
  /** `bg-bg`/`bg-bg-soft`/`bg-bg-muted`. */
  background?: BoxBackground | undefined;
  /** `rounded-sm`/`rounded-md`/`rounded-lg`. */
  radius?: BoxRadius | undefined;
  /** `border border-border`. */
  border?: boolean | undefined;
}

/**
 * General-purpose escape hatch for layout tweaks `Stack`/`Container`/`Card`/`Divider`
 * do not cover, so feature code never has to reach back for raw Tailwind.
 * Presentation-only, like every primitive here — no domain data.
 */
export const Box = forwardRef<HTMLDivElement, BoxProps>(function Box(
  { padding, margin, background, radius, border = false, className, children, ...rest },
  ref
) {
  return (
    <div
      {...rest}
      ref={ref}
      className={cx(
        padding !== undefined && resolvePadding(padding, 'p'),
        margin !== undefined && resolvePadding(margin, 'm'),
        background && BACKGROUND_CLASSES[background],
        radius && RADIUS_CLASSES[radius],
        border && 'border border-border',
        className
      )}
    >
      {children}
    </div>
  );
});
