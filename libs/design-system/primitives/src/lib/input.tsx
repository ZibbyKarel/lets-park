import { forwardRef, type InputHTMLAttributes } from 'react';

import {
  CONTROL_HEIGHT,
  CONTROL_TEXT,
  CONTROL_TRANSITION,
  FIELD_PADDING_X,
  FOCUS_RING,
  type ControlSize,
} from './control-size';
import { cx } from './cx';
import { Field, useFieldIds, type FieldOwnProps } from './field';

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
    FieldOwnProps {
  /**
   * Height step. Defaults to `md`. Shadows the native `size` attribute
   * deliberately — a character-count `size` has no place in a design system
   * whose every other control takes the same four-step scale.
   */
  size?: ControlSize | undefined;
  /** Stretches the input to its container. Defaults to `true`. */
  fullWidth?: boolean | undefined;
  /** Class applied to the outer wrapper rather than the `<input>` itself. */
  wrapperClassName?: string | undefined;
}

/** Single-line text field. A plain `<input>`, styled — no behaviour taken over. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    size = 'md',
    fullWidth = true,
    label,
    hint,
    error,
    id,
    className,
    wrapperClassName,
    disabled = false,
    ...rest
  },
  ref
) {
  const ids = useFieldIds(id, { hint, error });

  return (
    <Field ids={ids} label={label} hint={hint} error={error} className={wrapperClassName}>
      <input
        {...rest}
        ref={ref}
        id={ids.controlId}
        disabled={disabled}
        aria-invalid={ids.invalid || undefined}
        aria-describedby={ids.describedBy}
        className={cx(
          'rounded-md border placeholder:text-fg-3',
          CONTROL_HEIGHT[size],
          FIELD_PADDING_X[size],
          CONTROL_TEXT[size],
          CONTROL_TRANSITION,
          FOCUS_RING,
          // Swapped, never layered: same-property utilities resolve by
          // stylesheet order, not className order (see `button.tsx`). Disabled
          // wins over invalid — a field the user cannot edit should not also
          // be shouting an error at them through a red border.
          disabled
            ? 'border-border'
            : ids.invalid
              ? 'border-danger'
              : 'border-border focus-visible:border-brand-blue',
          disabled ? 'cursor-not-allowed bg-bg-muted text-fg-3' : 'bg-bg text-fg',
          fullWidth && 'w-full',
          className
        )}
      />
    </Field>
  );
});
