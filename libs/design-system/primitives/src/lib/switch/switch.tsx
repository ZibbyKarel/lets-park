'use client';

import { useId, useState, type ReactNode } from 'react';

import { CONTROL_TRANSITION, FOCUS_RING, PRESS_FEEDBACK } from '../control-size';
import { cx } from '../cx';

export type SwitchTone = 'info' | 'success';

const ON_CLASSES: Record<SwitchTone, string> = {
  info: 'bg-brand-blue',
  success: 'bg-brand-green',
};

export interface SwitchProps {
  /** Controlled state. Leave undefined to let the switch own its state. */
  checked?: boolean | undefined;
  /** Initial state when uncontrolled. Defaults to `false`. */
  defaultChecked?: boolean | undefined;
  /** Called with the state the switch is moving to. */
  onCheckedChange?: ((checked: boolean) => void) | undefined;
  /** Visible text to the right of the track; also the accessible name. */
  label?: ReactNode | undefined;
  /** Accessible name when there is no visible `label`. */
  'aria-label'?: string | undefined;
  /** Colour of the "on" track. Defaults to `info`. */
  tone?: SwitchTone | undefined;
  disabled?: boolean | undefined;
  id?: string | undefined;
  name?: string | undefined;
  className?: string | undefined;
}

/**
 * Two-state toggle.
 *
 * A `<button role="switch">` rather than a checkbox: the design draws a track
 * and a knob, and the state is applied immediately rather than on form submit,
 * which is exactly what `role="switch"` describes. Enter and Space come from
 * the button element itself.
 */
export function Switch({
  checked,
  defaultChecked = false,
  onCheckedChange,
  label,
  'aria-label': ariaLabel,
  tone = 'info',
  disabled = false,
  id,
  name,
  className,
}: SwitchProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const labelId = `${controlId}-label`;
  const [uncontrolled, setUncontrolled] = useState(defaultChecked);
  const isControlled = checked !== undefined;
  const isOn = isControlled ? checked : uncontrolled;

  const toggle = () => {
    if (disabled) {
      return;
    }
    if (!isControlled) {
      setUncontrolled(!isOn);
    }
    onCheckedChange?.(!isOn);
  };

  const button = (
    <button
      type="button"
      role="switch"
      id={controlId}
      name={name}
      aria-checked={isOn}
      aria-label={label ? undefined : ariaLabel}
      aria-labelledby={label ? labelId : undefined}
      disabled={disabled}
      onClick={toggle}
      className={cx(
        'inline-flex shrink-0 items-center rounded-cta border-0',
        'w-[var(--switch-w)] h-[var(--switch-h)] p-[var(--switch-pad)]',
        CONTROL_TRANSITION,
        FOCUS_RING,
        PRESS_FEEDBACK,
        isOn ? 'justify-end' : 'justify-start',
        disabled
          ? 'cursor-not-allowed bg-border'
          : cx('cursor-pointer', isOn ? ON_CLASSES[tone] : 'bg-border-strong'),
        !label && className
      )}
    >
      <span
        aria-hidden="true"
        className="size-[var(--switch-knob)] rounded-cta bg-bg shadow-[var(--switch-knob-shadow)]"
      />
    </button>
  );

  if (!label) {
    return button;
  }

  return (
    <span className={cx('inline-flex items-center gap-3', className)}>
      {button}
      <label
        id={labelId}
        htmlFor={controlId}
        className={cx('text-sm', disabled ? 'text-fg-3' : 'cursor-pointer text-fg')}
      >
        {label}
      </label>
    </span>
  );
}
