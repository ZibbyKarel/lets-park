'use client';

import { forwardRef, useEffect, useRef, type InputHTMLAttributes } from 'react';

import { CONTROL_TRANSITION, FOCUS_RING } from '../control-size';
import { cx } from '../cx';
import { mergeDescribedBy, useFieldIds, type FieldOwnProps } from '../field/field';

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'>,
    FieldOwnProps {
  /**
   * Renders the mixed state. Not an HTML attribute — `indeterminate` only
   * exists on the DOM node, so it has to be assigned through a ref.
   */
  indeterminate?: boolean | undefined;
  /** Class applied to the outer wrapper rather than the `<input>` itself. */
  wrapperClassName?: string | undefined;
}

/**
 * Checkbox built on the native `<input type="checkbox">`.
 *
 * The box is the input itself (`appearance-none` plus a border), not a
 * decorated sibling, so Space, label clicks, `:checked`, form submission and
 * the screen-reader contract are all the platform's.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    label,
    hint,
    error,
    indeterminate = false,
    id,
    className,
    wrapperClassName,
    disabled = false,
    // Pulled out of `rest` so it can be merged below rather than overwritten —
    // see `mergeDescribedBy` in `field.tsx`.
    'aria-describedby': callerDescribedBy,
    ...rest
  },
  ref
) {
  const ids = useFieldIds(id, { hint, error });
  const innerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (innerRef.current) {
      innerRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <div className={cx('flex flex-col gap-2', wrapperClassName)}>
      <div className="flex items-center gap-3">
        <span className="relative inline-flex shrink-0">
          <input
            {...rest}
            ref={(node) => {
              innerRef.current = node;
              if (typeof ref === 'function') {
                ref(node);
              } else if (ref) {
                ref.current = node;
              }
            }}
            type="checkbox"
            id={ids.controlId}
            disabled={disabled}
            aria-invalid={ids.invalid || undefined}
            aria-describedby={mergeDescribedBy(callerDescribedBy, ids.describedBy)}
            className={cx(
              'peer size-5 appearance-none rounded-xs border',
              CONTROL_TRANSITION,
              FOCUS_RING,
              ids.invalid ? 'border-danger' : 'border-border-strong',
              // Swapped, never layered: same-property utilities resolve by
              // stylesheet order, not className order (see `button.tsx`).
              // Disabled also greys the checked fill — brand blue on a control
              // the user cannot operate reads as actionable.
              disabled
                ? [
                    'cursor-not-allowed bg-bg-muted',
                    'checked:border-border-strong checked:bg-border-strong',
                    'indeterminate:border-border-strong indeterminate:bg-border-strong',
                  ].join(' ')
                : [
                    'cursor-pointer bg-bg',
                    'checked:border-brand-blue checked:bg-brand-blue',
                    'indeterminate:border-brand-blue indeterminate:bg-brand-blue',
                  ].join(' '),
              className
            )}
          />
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 14 14"
            className="pointer-events-none absolute inset-0 m-auto size-3 text-fg-on-blue opacity-0 peer-checked:opacity-100 peer-indeterminate:opacity-0"
          >
            <path
              d="M2 7.5 5.5 11 12 3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 14 14"
            className="pointer-events-none absolute inset-0 m-auto size-3 text-fg-on-blue opacity-0 peer-indeterminate:opacity-100"
          >
            <path
              d="M2.5 7h9"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
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
