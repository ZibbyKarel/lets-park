'use client';

import { cloneElement, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';

import { cx } from '../cx';
import { DismissableLayerProvider, useDismissableLayer } from '../dismissable-layer/dismissable-layer';

export type TooltipPlacement = 'top' | 'bottom';

/** The subset of the child's props this component reads and writes. */
interface DescribableChildProps {
  'aria-describedby'?: string | undefined;
}

export interface TooltipProps {
  /**
   * The bubble's text. Deliberately not a place for interactive content: a
   * tooltip is announced as the description of its trigger, so anything
   * focusable inside it would be unreachable.
   */
  content: ReactNode;
  /**
   * Exactly one focusable element. The tooltip describes whatever it is given —
   * a button, a link, a field — rather than rendering a trigger of its own.
   */
  children: ReactElement<DescribableChildProps>;
  /** Which side of the trigger the bubble sits on. Defaults to `top`. */
  placement?: TooltipPlacement | undefined;
  className?: string | undefined;
}

/**
 * Small bubble describing the control it wraps.
 *
 * **Keyboard-reachable, not hover-only.** It opens on `focus` as well as on
 * pointer enter, and closes on `blur`, pointer leave and `Escape`. A tooltip
 * that only appears on hover is invisible to keyboard and touch users, which is
 * the single most common way this component is got wrong.
 *
 * **Escape works even when the bubble opened from a hover, not a focus.**
 * WCAG 2.1 SC 1.4.13 requires content shown on hover to be dismissable without
 * moving the pointer or focus. A wrapper-level `onKeyDown` only ever fires for
 * keys delivered to something inside the wrapper, so it would never fire while
 * the pointer hovers and the keyboard is elsewhere on the page — exactly the
 * case the rule is about. The bubble is therefore registered with the page-wide
 * layer set (`useDismissableLayer`), whose single listener sits on `document`.
 *
 * **The tooltip does not always win the press.** Being the newest thing on
 * screen is not the same as owning the keyboard, and the layer set knows the
 * difference: a bubble opened inside a modal takes Escape ahead of that modal
 * (it is nested within it), but a bubble merely hovered while the keyboard is
 * in an unrelated menu does not take the press away from that menu — it closes
 * on the press after. Verified by tests in `dismissable-layer.spec.tsx` and
 * `tooltip.spec.tsx`, both of which fail if the rule is removed.
 *
 * `aria-describedby` is written **onto the child element itself**, merged with
 * any the caller already set. It cannot go on a wrapper: assistive technology
 * resolves a description from the focused element's own attributes, so a
 * `aria-describedby` one level up describes nothing at all — a mistake that
 * costs nothing at render time and everything at use time.
 *
 * The description is a description, not a name: a screen reader reads it after
 * the trigger's own label. A control whose only name would come from its
 * tooltip needs an `aria-label` instead, and this component deliberately will
 * not supply one — a name that appears only on hover is not a name.
 *
 * The bubble is mounted on demand rather than hidden with CSS, so it is absent
 * from the accessibility tree whenever it is not showing.
 */
export function Tooltip({ content, children, placement = 'top', className }: TooltipProps) {
  const bubbleId = useId();
  const [visible, setVisible] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  const show = () => setVisible(true);
  const hide = () => setVisible(false);

  // The wrapper, not the bubble, is what the layer set is given: it contains
  // the trigger too, so "is the keyboard in this layer?" is true for a tooltip
  // opened by focus and false for one merely hovered — which is exactly the
  // distinction the Escape rule turns on.
  const layer = useDismissableLayer({ active: visible, elementRef: wrapperRef, onDismiss: hide });

  const existingDescribedBy = children.props['aria-describedby'];
  const describedBy = visible
    ? [existingDescribedBy, bubbleId].filter(Boolean).join(' ')
    : existingDescribedBy;

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex"
      // React's onFocus/onBlur are focusin/focusout, so they fire for the child
      // as well — the wrapper can own the open/close state without the child
      // having to cooperate.
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <DismissableLayerProvider layer={layer}>
        {cloneElement(children, { 'aria-describedby': describedBy })}

        {visible ? (
          <span
            id={bubbleId}
            role="tooltip"
            className={cx(
              'absolute left-1/2 -translate-x-1/2 whitespace-normal rounded-xs',
              'max-w-[var(--tooltip-max-w)] bg-bg-inverse px-3 py-2',
              'text-xs leading-normal text-fg-on-dark shadow-md',
              'z-[var(--z-tooltip)]',
              placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
              className
            )}
          >
            {content}
          </span>
        ) : null}
      </DismissableLayerProvider>
    </span>
  );
}
