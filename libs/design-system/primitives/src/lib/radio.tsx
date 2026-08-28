import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

import { CONTROL_TRANSITION, FOCUS_RING } from './control-size';
import { cx } from './cx';
import { useFieldIds, type FieldOwnProps } from './field';

export interface RadioProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'>,
    FieldOwnProps {
  /** Class applied to the outer wrapper rather than the `<input>` itself. */
  wrapperClassName?: string | undefined;
}

/**
 * Radio built on the native `<input type="radio">`.
 *
 * Arrow-key roving between same-`name` radios, the "one of the group is
 * tabbable" focus rule and the group's screen-reader semantics all come from
 * the platform; only the ring and dot are drawn here.
 */
export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { label, hint, error, id, className, wrapperClassName, disabled = false, ...rest },
  ref
) {
  const ids = useFieldIds(id, { hint, error });

  return (
    <div className={cx('flex flex-col gap-2', wrapperClassName)}>
      <div className="flex items-center gap-3">
        <span className="relative inline-flex shrink-0">
          <input
            {...rest}
            ref={ref}
            type="radio"
            id={ids.controlId}
            disabled={disabled}
            // No `aria-invalid` here: `role="radio"` does not support it —
            // validity belongs to the group, so `RadioGroup` carries it.
            aria-describedby={ids.describedBy}
            className={cx(
              'peer size-5 appearance-none rounded-cta border',
              CONTROL_TRANSITION,
              FOCUS_RING,
              ids.invalid ? 'border-danger' : 'border-border-strong',
              // Swapped, never layered: same-property utilities resolve by
              // stylesheet order, not className order (see `button.tsx`).
              disabled
                ? 'cursor-not-allowed bg-bg-muted checked:border-border-strong'
                : 'cursor-pointer bg-bg checked:border-brand-blue',
              className
            )}
          />
          <span
            aria-hidden="true"
            className={cx(
              'pointer-events-none absolute inset-0 m-auto size-2 rounded-cta opacity-0 peer-checked:opacity-100',
              disabled ? 'bg-border-strong' : 'bg-brand-blue'
            )}
          />
        </span>
        {label ? (
          <label
            htmlFor={ids.controlId}
            className={cx('text-sm', disabled ? 'text-fg-3' : 'cursor-pointer text-fg')}
          >
            {label}
          </label>
        ) : null}
      </div>
      {hint ? (
        <p id={ids.hintId} className="text-xs text-fg-3">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={ids.errorId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
});

export interface RadioGroupProps extends FieldOwnProps {
  /** Accessible name for the whole group. */
  legend: ReactNode;
  /** Lays the radios out in a row instead of a column. */
  horizontal?: boolean | undefined;
  className?: string | undefined;
  children: ReactNode;
}

/**
 * `<fieldset>` around a set of radios, so the group has one accessible name
 * instead of each option standing alone.
 *
 * The fieldset carries an explicit `role="radiogroup"`, which is both the more
 * accurate mapping for a set of radios than the default `group`, and the role
 * that actually supports `aria-invalid` — a bare `group` does not, which is the
 * same reasoning `radio.spec.tsx` applies to the individual inputs.
 */
export function RadioGroup({
  legend,
  hint,
  error,
  horizontal = false,
  className,
  children,
}: RadioGroupProps) {
  const ids = useFieldIds(undefined, { hint, error });

  return (
    <fieldset
      role="radiogroup"
      className={cx('flex flex-col gap-3 border-0 p-0', className)}
      aria-describedby={ids.describedBy}
      aria-invalid={ids.invalid || undefined}
    >
      <legend className="mb-2 text-sm font-medium text-fg">{legend}</legend>
      <div className={cx('flex gap-3', horizontal ? 'flex-row items-center' : 'flex-col')}>
        {children}
      </div>
      {hint ? (
        <p id={ids.hintId} className="text-xs text-fg-3">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={ids.errorId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
