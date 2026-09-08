'use client';

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';

import {
  CONTROL_HEIGHT,
  CONTROL_SQUARE_WIDTH,
  CONTROL_TEXT,
  CONTROL_TRANSITION,
  FOCUS_RING,
  type ControlSize,
} from '../control-size';
import { cx } from '../cx';

export interface StepperProps {
  /** Controlled value. Leave undefined to let the stepper own its state. */
  value?: number | undefined;
  /** Initial value when uncontrolled. Defaults to `min`. */
  defaultValue?: number | undefined;
  onValueChange?: ((value: number) => void) | undefined;
  /** Defaults to `0`. */
  min?: number | undefined;
  /** Defaults to `Number.MAX_SAFE_INTEGER`. */
  max?: number | undefined;
  /** Increment per press. Defaults to `1`. */
  step?: number | undefined;
  /** Accessible name for the whole control. */
  label: string;
  /**
   * Renders the number as text — for a unit or a declension. The returned
   * string is also what assistive technology reads (`aria-valuetext`).
   */
  formatValue?: ((value: number) => string) | undefined;
  /** Accessible name of the minus button. */
  decrementLabel?: string | undefined;
  /** Accessible name of the plus button. */
  incrementLabel?: string | undefined;
  /**
   * Height step, shared with every other control on the form row. Defaults to
   * `lg`, which is the only size the design draws.
   */
  size?: ControlSize | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

/**
 * Structure only — no colors. Enabled and disabled each supply their own
 * border/background/text, because two utilities setting the same property
 * resolve by stylesheet order, not by className order (see `button.tsx`).
 */
const STEP_BUTTON_CLASSES = 'inline-flex items-center justify-center rounded-md border text-md';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Numeric stepper: minus, value, plus.
 *
 * The value is a `role="spinbutton"` rather than a read-only box, so it is
 * reachable by Tab and adjustable with the arrow keys, Home and End — the two
 * buttons are a pointer convenience, not the only way in.
 */
export function Stepper({
  value,
  defaultValue,
  onValueChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  label,
  formatValue,
  decrementLabel = 'Snížit',
  incrementLabel = 'Zvýšit',
  size = 'lg',
  disabled = false,
  className,
}: StepperProps) {
  const labelId = useId();
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? min);
  const isControlled = value !== undefined;
  const current = clamp(isControlled ? value : uncontrolled, min, max);
  const text = formatValue ? formatValue(current) : String(current);

  const commit = (next: number) => {
    const clamped = clamp(next, min, max);
    if (disabled || clamped === current) {
      return;
    }
    if (!isControlled) {
      setUncontrolled(clamped);
    }
    onValueChange?.(clamped);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const handlers: Record<string, () => void> = {
      ArrowUp: () => commit(current + step),
      ArrowRight: () => commit(current + step),
      ArrowDown: () => commit(current - step),
      ArrowLeft: () => commit(current - step),
      Home: () => commit(min),
      End: () => commit(max),
    };
    const handler = handlers[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  };

  const atMin = current <= min;
  const atMax = current >= max;

  return (
    <div className={cx('inline-flex items-center gap-2', className)}>
      <span id={labelId} className="sr-only">
        {label}
      </span>
      <StepButton
        label={decrementLabel}
        size={size}
        disabled={disabled || atMin}
        onClick={() => commit(current - step)}
      >
        −
      </StepButton>
      <div
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={labelId}
        aria-valuenow={current}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={text}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        className={cx(
          'inline-flex min-w-24 items-center justify-center rounded-md border border-border font-bold',
          CONTROL_HEIGHT[size],
          CONTROL_TEXT[size],
          CONTROL_TRANSITION,
          FOCUS_RING,
          disabled ? 'bg-bg-muted text-fg-3' : 'bg-bg text-fg'
        )}
      >
        {text}
      </div>
      <StepButton
        label={incrementLabel}
        size={size}
        disabled={disabled || atMax}
        onClick={() => commit(current + step)}
      >
        +
      </StepButton>
    </div>
  );
}

interface StepButtonProps {
  label: string;
  size: ControlSize;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}

function StepButton({ label, size, disabled, onClick, children }: StepButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        STEP_BUTTON_CLASSES,
        CONTROL_HEIGHT[size],
        CONTROL_SQUARE_WIDTH[size],
        CONTROL_TRANSITION,
        FOCUS_RING,
        // `text-fg-3`, not `text-border-strong`: the latter is 1.38:1 on
        // `--bg-muted` and effectively invisible, the former 4.40:1 and still
        // clearly inactive. Same reasoning as `DISABLED_CLASSES` in
        // `button.tsx`.
        disabled
          ? 'cursor-not-allowed border-border bg-bg-muted text-fg-3'
          : 'cursor-pointer border-border bg-bg text-fg hover:border-brand-dark'
      )}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
