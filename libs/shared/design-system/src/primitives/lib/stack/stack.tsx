import {
  Children,
  Fragment,
  forwardRef,
  isValidElement,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

import { cx } from '../cx';
import { resolveGap } from '../gap';
import type { SpacingKey } from '@lets-park/design-system/tokens';

export type StackDirection = 'row' | 'column';
export type StackAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
export type StackJustify = 'start' | 'center' | 'end' | 'between' | 'around';

const DIRECTION_CLASSES: Record<StackDirection, string> = {
  row: 'flex-row',
  column: 'flex-col',
};

const ALIGN_CLASSES: Record<StackAlign, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
};

const JUSTIFY_CLASSES: Record<StackJustify, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
};

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  /** Flex axis. Defaults to `column`. */
  direction?: StackDirection | undefined;
  /** Gap between children (`gap-{n}`). */
  spacing?: SpacingKey | undefined;
  /** Cross-axis alignment (`items-*`). */
  align?: StackAlign | undefined;
  /** Main-axis alignment (`justify-*`). */
  justify?: StackJustify | undefined;
  /** `flex-wrap`. */
  wrap?: boolean | undefined;
  /**
   * Rendered between every pair of children — typically a `<Divider>`. Each
   * copy gets its own key; `undefined`/`null` children are skipped first, so
   * a divider never lands next to a gap where a nullish child was.
   */
  divider?: ReactNode | undefined;
}

/**
 * Flex row/column with a gap, replacing `flex flex-col gap-*` and
 * `flex items-center gap-*` (30+ occurrences in `apps/lets-park/web`).
 */
export const Stack = forwardRef<HTMLDivElement, StackProps>(function Stack(
  {
    direction = 'column',
    spacing,
    align,
    justify,
    wrap = false,
    divider,
    className,
    children,
    ...rest
  },
  ref
) {
  // `Children.toArray` drops nullish/boolean children and assigns each
  // survivor a stable key (either its own explicit `key`, or a
  // position-derived one it generates). The wrapper below must read that key
  // back off the element — re-keying by array index here would defeat the
  // whole point: on a reorder, React would match wrappers by position
  // instead of by identity, and any uncontrolled state inside a child would
  // jump to whichever child now sits at that position instead of following
  // the child it belonged to.
  const items = Children.toArray(children);

  return (
    <div
      {...rest}
      ref={ref}
      className={cx(
        'flex',
        DIRECTION_CLASSES[direction],
        spacing !== undefined && resolveGap(spacing),
        align && ALIGN_CLASSES[align],
        justify && JUSTIFY_CLASSES[justify],
        wrap && 'flex-wrap',
        className
      )}
    >
      {divider
        ? items.map((child, index) => {
            const key = isValidElement(child) ? child.key : null;

            return (
              <Fragment key={key ?? index}>
                {index > 0 ? divider : null}
                {child}
              </Fragment>
            );
          })
        : items}
    </div>
  );
});
