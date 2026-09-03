# 0267 – Disabled labels are dimmed to `--fg-3`, not to invisibility

## What

`Button`'s `DISABLED_CLASSES` and `Stepper`'s `StepButton` drew their label with
`text-border-strong` #D1D1D6 on `bg-bg-muted` #F4F4F5 — **1.38:1**. Both now use
`text-fg-3` #71717A on the same surface — **4.40:1**.

An enabled button's label (`--fg` on `--bg`) is 15.53:1, so the disabled state
is still about three and a half times less contrasty than the enabled one.

## Why

- **Not a conformance failure, and fixed anyway.** WCAG 2.1 SC 1.4.3 explicitly
  exempts "text or images of text that are part of an inactive user interface
  component", so 1.38:1 broke no rule. It was still text nobody could read: two
  disabled buttons side by side could not be told apart, and a disabled
  destructive action could not be distinguished from a disabled save.
- **`--fg-3` is the right step, and it is already the disabled colour
  everywhere else in the lib.** `Input`, `Select`, `Checkbox` and `Radio` all
  use `text-fg-3` when disabled. The two that did not were the two that were
  wrong; this makes them consistent rather than introducing a rule.
- **`--border-strong` is a line colour.** Its job is `--neutral-300` borders. It
  had drifted into a text role, which is how it ended up at 1.38:1 — the same
  class of mistake as `0266`.

## How

- `libs/design-system/primitives/src/lib/button.tsx` (`DISABLED_CLASSES`) and
  `stepper.tsx` (`StepButton`). The stepper's *value* readout was already
  `text-fg-3`; only its two step buttons were not.
- Guarded by `contrast.spec.tsx`, which holds disabled labels to a **3:1**
  floor — AA's threshold for non-text interface components, chosen because AA's
  text threshold genuinely does not apply here. Reverting either line fails it
  with `Expected: >= 3   Received: 1.384223555919286`.
- `disabled-styling.spec.tsx`'s docstring still records the historical bug that
  made this file exist (`text-border-strong` is emitted before `text-fg`, so a
  layered disabled colour silently lost); that remains true as history and is
  the reason the disabled classes are *swapped in*, not layered.

## Risk

- **A disabled control now reads as more present than before.** That is the
  intent, but if a design review wants disabled controls quieter, the step
  below (`--border-strong`) is the one that was just removed, and there is
  nothing between them on the neutral scale. `--neutral-400` #A1A1AA would be
  2.53:1 — better than 1.38:1, still unreadable.
