# 0270 – A form control merges `aria-describedby`; it never replaces it

## What

`Input`, `Select`, `Checkbox` and `Radio` spread `{...rest}` onto the native
element and then wrote `aria-describedby={ids.describedBy}` after it. Any
`aria-describedby` a caller had set was overwritten — and when the field had no
hint and no error of its own, it was overwritten with `undefined`, which React
removes from the DOM entirely.

All four now destructure `'aria-describedby': callerDescribedBy` out of the
props and emit `mergeDescribedBy(callerDescribedBy, ids.describedBy)`, a new
helper exported from `field.tsx`.

## Why

- **It reached a user, measurably.** `Tooltip` describes the control it wraps by
  cloning it with its own bubble id — the only construction that works, because
  assistive technology resolves a description from the focused element's own
  attributes. Wrapping a design-system `Input` in a `Tooltip` produced
  `aria-describedby = null`: the bubble rendered, `role="tooltip"` was in the
  accessibility tree, and a screen-reader user was told nothing.
- **The shipped test passed on a defence other than the one it named.**
  `tooltip.spec.tsx`'s field case wrapped a bare `<input aria-label="Kód" />`,
  which writes no `aria-describedby` of its own and so has nothing to overwrite
  with. The shipped story `tooltip.stories.tsx` (`OnAField`) wrapped a real
  `Input` — the combination that was broken. The story shipped the broken shape
  and the test covered only the working one.
- **The `Tooltip` was already right.** It merges (`[existingDescribedBy,
  bubbleId].filter(Boolean).join(' ')`) and its docstring says so. The four
  controls were the ones assigning.
- **Merging is the general rule, not a tooltip workaround.** `aria-describedby`
  is a space-separated list by specification. A component that owns *part* of a
  control's description has no business discarding the rest — a `Tooltip`, a
  form library's error summary and a `hint` can all legitimately want to
  describe the same field at once.

## How

- `mergeDescribedBy(...values)` in
  `libs/design-system/primitives/src/lib/field.tsx` joins the non-empty values
  and returns `undefined` when nothing is left, so React drops the attribute
  rather than emitting `aria-describedby=""` — a description that resolves to
  nothing is worse than no description.
- `RadioGroup`'s `<fieldset>` is left as an assignment: it takes no rest props,
  so no caller can set the attribute on it.
- `tooltip.spec.tsx`'s field case now uses the real `Input`, a second case uses
  the real `Select`, and a third asserts a field's own `hint` survives alongside
  the tooltip's description (`'Formát REF-4821 Najdete ho na kartě'`). Story and
  test now exercise the same path.
- Falsified: reverting all four controls to `aria-describedby={ids.describedBy}`
  fails 3 of the 14 `Tooltip` tests with *"Expected element to have accessible
  description"*; restoring passes all 14.

## Risk

- **Order is caller-first.** `mergeDescribedBy(callerDescribedBy,
  ids.describedBy)` puts a tooltip's bubble ahead of the field's own hint, so a
  screen reader reads the tooltip first. That matches the `Tooltip`'s own
  existing merge order, but it is a choice; the opposite order is equally
  defensible and would be a one-argument swap.
- **Only these four controls were audited.** `Switch` and `Stepper` do not write
  `aria-describedby` at all, and `Modal` writes its own from a `description`
  prop it owns. A future control that spreads `{...rest}` before an ARIA
  attribute will reintroduce the same bug; the `mergeDescribedBy` docstring is
  where that is written down.
