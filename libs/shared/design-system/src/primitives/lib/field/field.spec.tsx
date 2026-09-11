import { render, renderHook, screen } from '@testing-library/react';

import { Field, mergeDescribedBy, useFieldIds, type FieldOwnProps } from './field';

/**
 * `Field` and `useFieldIds` are exported primitives, so they are reachable
 * without `Input` or `Select`. Everything below is a path those two never take
 * — a hint with no label, a hint *and* an error at once, a caller-supplied id,
 * a `ReactNode` label — which is exactly why none of it was covered before.
 */

/** Renders `Field` the way every real caller does: paired with `useFieldIds`. */
function FieldHost({ id, ...own }: FieldOwnProps & { id?: string | undefined }) {
  const ids = useFieldIds(id, own);

  return (
    <Field ids={ids} {...own}>
      <input
        id={ids.controlId}
        aria-invalid={ids.invalid || undefined}
        aria-describedby={ids.describedBy}
      />
    </Field>
  );
}

describe('useFieldIds', () => {
  it('describes nothing when there is nothing to describe', () => {
    const { result } = renderHook(() => useFieldIds(undefined, {}));

    // `undefined`, not `''`: React removes the attribute entirely, so the
    // element does not claim a description it cannot resolve.
    expect(result.current.describedBy).toBeUndefined();
    expect(result.current.invalid).toBe(false);
  });

  it('composes describedBy in document order: hint first, then error', () => {
    const { result } = renderHook(() => useFieldIds('pole', { hint: 'Nápověda', error: 'Chyba' }));

    expect(result.current.describedBy).toBe('pole-hint pole-error');
    expect(result.current.hintId).toBe('pole-hint');
    expect(result.current.errorId).toBe('pole-error');
  });

  it('names only the part that is present', () => {
    const hintOnly = renderHook(() => useFieldIds('pole', { hint: 'Nápověda' }));
    const errorOnly = renderHook(() => useFieldIds('pole', { error: 'Chyba' }));

    expect(hintOnly.result.current.describedBy).toBe('pole-hint');
    expect(errorOnly.result.current.describedBy).toBe('pole-error');
  });

  it("an explicit id wins over the generated one, so a consumer's own labelling keeps working", () => {
    const provided = renderHook(() => useFieldIds('spz', { hint: 'Nápověda' }));
    const generated = renderHook(() => useFieldIds(undefined, { hint: 'Nápověda' }));

    expect(provided.result.current.controlId).toBe('spz');
    expect(provided.result.current.hintId).toBe('spz-hint');
    // ...and without one, every id still hangs off a single generated root, so
    // two fields on a page cannot collide.
    expect(generated.result.current.controlId).not.toBe('spz');
    expect(generated.result.current.hintId).toBe(`${generated.result.current.controlId}-hint`);
  });

  it('treats the presence of an error as the invalid state — the two cannot disagree', () => {
    const { result, rerender } = renderHook(
      ({ error }: { error?: string }) => useFieldIds('pole', { error }),
      { initialProps: {} as { error?: string } }
    );

    expect(result.current.invalid).toBe(false);

    rerender({ error: 'Chyba' });

    expect(result.current.invalid).toBe(true);
  });
});

describe('mergeDescribedBy', () => {
  it('joins what is there and drops what is not', () => {
    expect(mergeDescribedBy('a', 'b')).toBe('a b');
    expect(mergeDescribedBy(undefined, 'b')).toBe('b');
    expect(mergeDescribedBy('a', undefined)).toBe('a');
  });

  it('returns undefined rather than an empty string when nothing is left', () => {
    // `aria-describedby=""` is a description that resolves to nothing;
    // `undefined` makes React drop the attribute instead.
    expect(mergeDescribedBy(undefined, undefined)).toBeUndefined();
  });
});

describe('Field', () => {
  it('ties the label to the control with htmlFor, so the label is the accessible name', () => {
    render(<FieldHost label="Jméno" />);

    expect(screen.getByLabelText('Jméno')).toBeInTheDocument();
  });

  it('renders a hint without a label, and still describes the control', () => {
    render(<FieldHost hint="Nepovinné pole." />);

    expect(screen.queryByRole('textbox', { name: 'Nepovinné pole.' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription('Nepovinné pole.');
  });

  it('renders hint and error together, describing the control with both', () => {
    render(<FieldHost label="Jméno" hint="Nápověda" error="Chyba" />);

    const input = screen.getByLabelText('Jméno');

    expect(input).toHaveAccessibleDescription('Nápověda Chyba');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    // The error is announced as it appears, not only when the field is read.
    expect(screen.getByRole('alert')).toHaveTextContent('Chyba');
  });

  it('accepts a ReactNode label, not only a string', () => {
    render(
      <FieldHost
        label={
          <>
            Jméno <span>*</span>
          </>
        }
      />
    );

    expect(screen.getByLabelText('Jméno *')).toBeInTheDocument();
  });

  it('is presentation only: it never touches the control it wraps', () => {
    render(
      <Field
        ids={{
          controlId: 'x',
          describedBy: 'x-hint',
          hintId: 'x-hint',
          errorId: 'x-error',
          invalid: true,
        }}
        label="Jméno"
        hint="Nápověda"
      >
        <input id="x" data-testid="bare" />
      </Field>
    );

    const bare = screen.getByTestId('bare');

    // `Field` renders the text around the control and nothing else — it did not
    // reach in and set `aria-describedby` or `aria-invalid` for it, which is
    // why every caller wires those itself from the same `ids` object.
    expect(bare).not.toHaveAttribute('aria-describedby');
    expect(bare).not.toHaveAttribute('aria-invalid');
  });
});
