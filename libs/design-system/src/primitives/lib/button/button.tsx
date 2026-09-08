import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import {
  CONTROL_HEIGHT,
  CONTROL_PADDING_X,
  CONTROL_TEXT,
  CONTROL_TRANSITION,
  FOCUS_RING,
  PRESS_FEEDBACK,
  type ControlSize,
} from '../control-size';
import { cx } from '../cx';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  /** The blue call to action. */
  primary:
    'border-transparent bg-brand-blue text-fg-on-blue font-bold hover:bg-brand-blue-700 hover:shadow-blue',
  /** Quiet companion to `primary` — a bordered white pill. */
  secondary: 'border-border bg-bg text-fg font-medium hover:border-brand-dark',
  /** Bordered, transparent; inverts to solid dark on hover. */
  outline:
    'border-brand-dark bg-transparent text-brand-dark font-bold hover:bg-brand-dark hover:text-fg-on-dark',
  /**
   * Destructive. Soft red until hovered, then solid.
   *
   * The label is `--fg`, not `--danger`: red-on-pink measures 3.26:1, below the
   * 4.5:1 AA needs at this text size, while `--fg` on the same tint is 14.80:1.
   * The pink fill is what says "destructive" — see `badge.tsx` for the same
   * rule stated in full, and
   * `doc/decision/0266-badge-avatar-and-toast-read-their-text-off-the-neutral-scale.md`.
   */
  danger:
    'border-danger-100 bg-danger-100 text-fg font-bold hover:border-danger hover:bg-danger hover:text-fg-on-dark',
  /** No chrome at all until hovered. */
  ghost: 'border-transparent bg-transparent text-fg font-medium hover:bg-bg-muted',
};

/**
 * Applied *instead of* the variant classes, never alongside them. Tailwind
 * emits utilities in its own order, so a `disabled:` override of a variant
 * would win or lose depending on which utility group each class lands in —
 * swapping the whole set in JS is the only way to make it deterministic.
 *
 * The label is `--fg-3`, not `--border-strong`. Disabled text is exempt from
 * WCAG 1.4.3, so `--border-strong` on `--bg-muted` was not a conformance
 * failure — but at 1.38:1 it is not readable either, and two disabled buttons
 * side by side could not be told apart. `--fg-3` on the same surface is 4.40:1:
 * still visibly inactive against the 15.5:1 an enabled label gets, and legible.
 * See `doc/decision/0267-disabled-labels-are-dimmed-to-fg-3-not-to-invisibility.md`.
 */
const DISABLED_CLASSES = 'border-border bg-bg-muted text-fg-3 shadow-none cursor-not-allowed';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight. Defaults to `primary`. */
  variant?: ButtonVariant | undefined;
  /** Height step. Defaults to `md`. */
  size?: ControlSize | undefined;
  /**
   * Shows a spinner and blocks interaction. Announced as `aria-busy`; the
   * label stays visible so the button does not change width mid-flight.
   */
  loading?: boolean | undefined;
  /** Stretches the button to its container. */
  fullWidth?: boolean | undefined;
  /** Rendered before the label, inside the same flex row. */
  startAdornment?: ReactNode | undefined;
  /** Rendered after the label. */
  endAdornment?: ReactNode | undefined;
}

/**
 * The design's pill button, in five weights and four heights.
 *
 * Always a real `<button>` — never a styled `<div>` — so Enter/Space, form
 * submission and the disabled state come from the platform.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth = false,
    startAdornment,
    endAdornment,
    disabled = false,
    type = 'button',
    className,
    children,
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading;

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-cta border whitespace-nowrap',
        CONTROL_HEIGHT[size],
        CONTROL_PADDING_X[size],
        CONTROL_TEXT[size],
        CONTROL_TRANSITION,
        FOCUS_RING,
        PRESS_FEEDBACK,
        isDisabled ? DISABLED_CLASSES : `cursor-pointer ${VARIANT_CLASSES[variant]}`,
        fullWidth && 'w-full',
        className
      )}
    >
      {loading ? (
        <span
          data-testid="button-spinner"
          aria-hidden="true"
          className="size-4 animate-spin rounded-cta border-2 border-current border-t-transparent"
        />
      ) : (
        startAdornment
      )}
      {children}
      {!loading && endAdornment}
    </button>
  );
});
