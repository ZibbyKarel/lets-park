import type { ReactNode } from 'react';

import { FOCUS_RING } from './control-size';
import { cx } from './cx';

export type ToastTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/**
 * Surface and border per tone, modelled on the design's own tinted notice
 * block (`background:#FFF4D2; border:1px solid #FFBE0E`) rather than invented:
 * a 100-level tint with its full-strength counterpart as the border.
 *
 * Each entry is a complete pair — background *and* border in one string — so no
 * element can ever end up carrying one tone's background over another's border
 * (see `button.tsx` on why same-property utilities must be swapped, not
 * layered).
 */
const TONE_CLASSES: Record<ToastTone, string> = {
  neutral: 'bg-bg border-border',
  info: 'bg-brand-blue-100 border-brand-blue',
  success: 'bg-brand-green-100 border-brand-green',
  warning: 'bg-brand-yellow-100 border-brand-yellow',
  danger: 'bg-danger-100 border-danger',
};

/** Colour of the leading glyph's chip, matching the tone's border. */
const GLYPH_CLASSES: Record<ToastTone, string> = {
  neutral: 'bg-bg-muted text-fg-2',
  info: 'bg-brand-blue text-fg-on-blue',
  success: 'bg-brand-green text-fg-on-green',
  warning: 'bg-brand-yellow text-fg-on-yellow',
  danger: 'bg-danger text-fg-on-dark',
};

export interface ToastProps {
  /** Bold first line. Optional — a one-line notice needs only `children`. */
  title?: ReactNode | undefined;
  /** The message itself. */
  children: ReactNode;
  /** Colour and, for `danger`, the announcement urgency. Defaults to `info`. */
  tone?: ToastTone | undefined;
  /** Small glyph on the left, e.g. a status mark. Decorative. */
  icon?: ReactNode | undefined;
  /** Shows a dismiss button that calls this. */
  onDismiss?: (() => void) | undefined;
  /** Accessible name of the dismiss button. Defaults to `'Zavřít'`. */
  dismissLabel?: string | undefined;
  className?: string | undefined;
}

/**
 * A single notice.
 *
 * **Announced without stealing focus.** The whole point of a toast is that it
 * reports something while the user carries on doing what they were doing, so it
 * must never call `focus()`. It is announced instead, by living in a live
 * region: `role="status"` (polite — the screen reader finishes its sentence
 * first) for every tone but `danger`, which gets `role="alert"` (assertive,
 * interrupting) because a failure the user is about to act on cannot wait for a
 * natural pause.
 *
 * **Deliberately presentational, with no queue, timer or imperative API.**
 * Deciding *when* a notice appears, how long it stays and how several of them
 * stack is application state, not a design-system concern — a primitive that
 * owned a global mutable queue could not be rendered twice on a page or tested
 * in isolation. `ToastRegion` below is the positioning shell; the app supplies
 * the list. See `doc/decision/0023-toast-je-prezentacni.md`.
 *
 * For a live region to announce at all it has to be **in the DOM before the
 * message is**: a region that appears already containing text is frequently not
 * read. Render `ToastRegion` unconditionally and let the list of toasts inside
 * it be empty.
 */
export function Toast({
  title,
  children,
  tone = 'info',
  icon,
  onDismiss,
  dismissLabel = 'Zavřít',
  className,
}: ToastProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx(
        'flex w-full items-start gap-3 rounded-md border p-4 shadow-md',
        'max-w-[var(--toast-w)] text-sm leading-normal text-fg',
        TONE_CLASSES[tone],
        className
      )}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className={cx(
            'inline-flex size-5 shrink-0 items-center justify-center rounded-xs text-xs font-bold',
            GLYPH_CLASSES[tone]
          )}
        >
          {icon}
        </span>
      ) : null}

      <div className="flex flex-col gap-1">
        {title ? <span className="font-bold">{title}</span> : null}
        <span>{children}</span>
      </div>

      {onDismiss ? (
        <button
          type="button"
          aria-label={dismissLabel}
          onClick={onDismiss}
          className={cx(
            'ml-auto inline-flex size-5 shrink-0 cursor-pointer items-center justify-center',
            'rounded-cta border-0 bg-transparent text-fg-3',
            'transition duration-[var(--dur-fast)] ease-out hover:text-fg',
            FOCUS_RING
          )}
        >
          <svg aria-hidden="true" focusable="false" viewBox="0 0 14 14" className="size-3">
            <path
              d="M1 1 13 13M13 1 1 13"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

export type ToastRegionPlacement = 'top-right' | 'bottom-right' | 'bottom-center';

const REGION_PLACEMENT: Record<ToastRegionPlacement, string> = {
  'top-right': 'top-6 right-6 items-end',
  'bottom-right': 'bottom-6 right-6 items-end',
  'bottom-center': 'bottom-6 left-1/2 -translate-x-1/2 items-center',
};

export interface ToastRegionProps {
  /** `Toast` elements. May be empty — and usually is. */
  children?: ReactNode | undefined;
  /** Where the stack sits in the viewport. Defaults to `top-right`. */
  placement?: ToastRegionPlacement | undefined;
  /** Accessible name of the region, e.g. `'Oznámení'`. */
  label?: string | undefined;
  className?: string | undefined;
}

/**
 * Fixed shell that positions a stack of toasts.
 *
 * `pointer-events-none` on the shell with `pointer-events-auto` on each child
 * keeps the empty space around the stack clickable — otherwise an invisible
 * region would swallow clicks on whatever it covers, which is a bug that only
 * shows up on the parts of the page nobody tests.
 */
export function ToastRegion({
  children,
  placement = 'top-right',
  label,
  className,
}: ToastRegionProps) {
  return (
    <div
      // `region` rather than a second live region: the toasts themselves carry
      // `role="status"`/`"alert"`. Nesting live regions makes some screen
      // readers announce a message twice.
      role="region"
      aria-label={label}
      className={cx(
        'pointer-events-none fixed flex flex-col gap-3',
        'z-[var(--z-toast)]',
        REGION_PLACEMENT[placement],
        className
      )}
    >
      {children ? <div className="pointer-events-auto flex flex-col gap-3">{children}</div> : null}
    </div>
  );
}
