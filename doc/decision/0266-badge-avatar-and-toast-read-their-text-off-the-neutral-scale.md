# 0266 – Tinted surfaces read their text off the neutral scale; the tint carries the tone

## What

Four colour pairings in `libs/design-system/primitives` changed. In each, a
saturated brand or status colour was being used as *text* on its own tint, and
did not clear the WCAG 2.1 AA threshold for normal-size text (4.5:1):

| where | was | measured | now | measured |
| --- | --- | --- | --- | --- |
| `badge.tsx` `success` | `--brand-green-700` on `--brand-green-100` | 2.31:1 | `--fg-2` on the same tint | **9.05:1** |
| `badge.tsx` / `avatar.tsx` `info` | `--brand-blue` on `--brand-blue-100` | 2.88:1 | `--fg-2` on the same tint | **9.14:1** |
| `badge.tsx` `danger`, `button.tsx` `danger` (resting) | `--danger` on `--danger-100` | 3.26:1 | `--fg-2` (badge) / `--fg` (button) on the same tint | **8.69:1** / **14.80:1** |
| `toast.tsx` `success` glyph | `--fg-on-green` #FFFFFF on `--brand-green` #00DB33 | 1.88:1 | `--brand-dark` on the same green | **8.47:1** |
| `modal.tsx` eyebrow | `--brand-blue` on `--brand-light` | 2.88:1 | `--fg-2` on the same tint | **9.14:1** |

The last row was **not** in the review's list. It is the same 2.88:1 pairing as
`info`, spelled with the other alias: `--brand-light` and `--brand-blue-100` are
both #E2F2FF, and `tokens.css` even defines the second as `var(--brand-light)`.
A check that compared token *names* would not have found it. The one added here
resolves them to values first, which is how it turned up.

No token value changed. `--fg-on-green` is still white, exactly as
`doc/design/ds/colors_and_type.css:126` defines it; only the toast's decision to
pair it with `--brand-green` did.

Two pairings the review also flagged were deliberately **not** changed — see
`0265`.

## Why

- **The pairings are this lib's own choice; the hexes are not.** Every hex in
  `tokens.css` is a byte-faithful copy of the design's foundations file. Which
  foreground a `Badge` puts on which background was decided in
  `badge.tsx`'s `TONE_CLASSES`, by this lib, with nothing to check it.
- **The `-700` step does not rescue any of them.** That was the first thing
  tried, because it is the cheapest. Measured on the matching 100-level tint:
  `--brand-blue-700` reaches 4.29:1, still short; `--brand-yellow-700` is
  1.93:1, far worse than the `--fg-on-yellow` the yellow badge already used.
  There is no `--danger-700` in the design at all. So there is no "darker
  brand colour" answer, and the neutral scale is the only one left.
- **Uniform text colour is not a loss of meaning, because the tint already
  carries it.** `neutral` and `warning` were the two tones that already passed,
  and both already did exactly this — `--fg-2` on `--bg-muted`, `--fg-on-yellow`
  on `--brand-yellow-100`. The change makes the other three consistent with the
  two that were right, rather than inventing a rule.
- **The `danger` button gets `--fg`, not `--fg-2`.** It is an action label, not
  a status word; at 14.80:1 it reads at full weight, and the pink fill plus the
  solid-red hover are what say "destructive". A destructive button whose label
  is dimmer than a secondary button's would be the wrong signal.
- **The toast's success glyph was the worst pairing in the lib.** 1.88:1 is
  below the 3:1 AA floor for *non-text* interface components, let alone for
  text, and it is drawn at 12px. `--brand-dark` on the same green is 8.47:1.

## How

- `libs/design-system/primitives/src/lib/badge/badge.tsx`, `avatar.tsx`, `toast.tsx`,
  `button.tsx`.
- Guarded by `libs/design-system/primitives/src/lib/contrast.spec.tsx`, which
  renders every tone and variant, reads the colour classes **off the rendered
  element** rather than out of the component's source, and computes the ratio
  from `COLOR_UTILITIES` in the tokens lib. Reverting any of the four rows above
  makes it fail with the old ratio printed:

  ```
  Expected: >= 4.5   Received: 2.883829880710912   (Badge info, Avatar info)
  Expected: >= 4.5   Received: 2.306920750293849   (Badge success)
  Expected: >= 4.5   Received: 3.257394215108607   (Badge danger, Button danger)
  Expected: >= 4.5   Received: 1.8782852486065995  (Toast success glyph)
  ```

## Risk

- **The status pills lose their coloured text.** A `success` badge and a
  `neutral` badge now differ only by their background. That is the intended
  trade — the tint is still distinct, and the previous version was text nobody
  with ordinary eyesight could read comfortably and many could not read at
  all — but it is a visible change to a surface the design drew, and a designer
  may prefer a different remedy (a darker green token, say). The measured
  alternatives are in the table above.
- **The `danger` button no longer looks red at rest.** Border and fill are still
  `--danger-100`; only the label changed. The hover state is unchanged and still
  goes solid red.
- **Contrast is computed from tokens, not sampled from pixels.** Anything
  produced by opacity, a gradient, or one element showing through another is
  outside what this can measure.
