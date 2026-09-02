import { cloneElement, useEffect, useId, useState, type ReactElement, type ReactNode } from 'react';

import { cx } from './cx';

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
 * moving the pointer or focus. Because of that, the `Escape` listener is
 * attached to `document` for as long as the bubble is visible, rather than to
 * the wrapper: a wrapper-level `onKeyDown` only ever fires for keys delivered
 * to something inside the wrapper, so it would never fire while the pointer is
 * hovering and focus is elsewhere on the page — exactly the case this rule is
 * about.
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

  const show = () => setVisible(true);
  const hide = () => setVisible(false);

  useEffect(() => {
    if (!visible) {
      return;
    }

    // Document-level, not a wrapper `onKeyDown`: a hover-opened bubble can be
    // visible while focus sits elsewhere on the page, and a keydown delivered
    // there would never reach a listener on this wrapper. `stopPropagation`
    // still keeps a surrounding Modal's own Escape handler from also firing.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        // `setVisible` directly, not `hide()`: it is the stable identity React
        // guarantees, so the effect's dependency array can name only `visible`.
        setVisible(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => document.removeEventListener('keydown', onKeyDown);
  }, [visible]);

  const existingDescribedBy = children.props['aria-describedby'];
  const describedBy = visible
    ? [existingDescribedBy, bubbleId].filter(Boolean).join(' ')
    : existingDescribedBy;

  return (
    <span
      className="relative inline-flex"
      // React's onFocus/onBlur are focusin/focusout, so they fire for the child
      // as well — the wrapper can own the open/close state without the child
      // having to cooperate.
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
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
    </span>
  );
}
