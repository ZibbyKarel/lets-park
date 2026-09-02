# 0024 – Escape goes to the innermost open layer

## What

Every overlay in `libs/design-system/primitives` that can be dismissed with
Escape registers with **one page-wide set** (`dismissable-layer.ts`,
`useDismissableLayer`) while it is open, and unregisters when it closes or
unmounts. The set owns the single `keydown` listener on `document`. No overlay
binds an Escape listener of its own any more.

Currently in the set: `Modal` (through `useFocusTrap`, which delegates its
`onEscape`), `Dropdown`, `Tooltip`. `Tabs` and `Toast` are not dismissable by
Escape and are therefore not in it.

One press dismisses **exactly one** layer, chosen in this order:

1. **Innermost wins.** A layer with another registered layer inside it is not
   the target; the nested one is. Containment is read from the DOM.
2. **Then the keyboard.** Layers that are all innermost — unrelated siblings —
   are decided by which one contains `document.activeElement`.
3. **Then the most recent.** Otherwise, last registered wins.

The layer beneath is reached by pressing Escape again.

## Why

Before this, each overlay bound its own `keydown` listener to `document`, so
"which overlay does this press close?" was answered by listener phase and
registration order. Two fix rounds moved that ordering around, and each produced
a wrong answer somewhere else:

- **Round 1** — Tooltip and Modal both listened on `document` in the bubble
  phase. `stopPropagation()` does nothing to a sibling listener on the same
  node, so one press closed both.
- **Round 2** — Tooltip moved to the capture phase and called
  `stopPropagation()`. That fixed the nesting case and broke a wider one: a
  capture-phase `stopPropagation()` at `document` halts the entire dispatch
  before the event reaches its target, so while any tooltip was visible
  anywhere on the page, Escape never reached any other consumer. Reproduced
  with a Dropdown and a Tooltip as unrelated siblings: the press aimed at the
  open menu was eaten by a merely-hovered bubble.

Both failures share a cause: mount order and listener phase are properties no
overlay controls and neither of them is what "topmost" means. A third patch to
the phase — or `stopImmediatePropagation()` — would only have produced a third
ordering bug. Making the question structural is the only version that does not
depend on which component happened to mount first.

Rule 2 is the part worth defending. Being the newest thing drawn on screen is
not the same as owning the keyboard: a tooltip shown because the mouse is
resting on something is not where the user's Escape is aimed if their focus is
inside a menu. WCAG 2.1 SC 1.4.13 still holds — the hover-shown bubble is
dismissable by Escape without moving the pointer or focus; it just takes the
next press when another widget legitimately owns the current one. The success
criterion requires dismissability, not that the first press must be the one.

## Alternatives rejected

- **`stopImmediatePropagation()` on a document listener.** Still decided by
  registration order — see round 2.
- **A React context provider holding the stack.** Overlays are unrelated
  siblings as often as they are nested, so the provider would have to be
  mounted above all of them by the application. A primitive cannot enforce
  that, and forgetting it would fail silently. The stack is module-level for
  that reason; the trade-off is one set per JS module instance, which is
  correct for one app bundle and is what the tests exercise.
- **Ordering the set by `z-index` token.** `--z-tooltip` is above
  `--z-dropdown`, so a hovered bubble would keep stealing the menu's press —
  the exact defect this record closes.
- **Only stopping the event when an enclosing Modal can be identified**
  (suggested in the round-2 review). It keeps the per-overlay listeners, so it
  answers only the Modal case and leaves every future pair to be special-cased
  one at a time.

## Click-outside is deliberately not in the set

`Dropdown` keeps its own `mousedown` listener. A pointer event names its own
target, so every open overlay can independently and correctly answer "was that
outside me?" — and when a click really is outside two overlays at once, closing
both is the right answer, not a conflict to arbitrate. Escape names nothing,
which is the only reason it needs a single arbiter. Folding pointer dismissal
into the same LIFO set would have introduced an arbitration step where none is
needed.

## Consequences

- `useFocusTrap`'s `keydown` listener now handles Tab only. Its `onEscape`
  option is unchanged for callers; omitting it keeps the container out of the
  set entirely, so Escape falls through instead of being absorbed.
- `Dropdown`'s menu `onKeyDown` no longer has an `Escape` case, and no longer
  calls `stopPropagation()` for it.
- Public props of all five overlay primitives are unchanged.
- The set does not claim Escape from application-level `document` listeners: it
  neither calls `stopPropagation()` (there is nothing above `document` to stop)
  nor runs in the capture phase, so handlers inside the tree still see the
  event first and can `stopPropagation()` to override the set.
- An overlay added later that must be Escape-dismissable belongs in the set.
  Adding one means passing `active` and its outermost node — nothing else.

## Verification

`dismissable-layer.spec.tsx` covers the set's contract directly: LIFO order,
out-of-order removal, unmount while open, one listener for the whole set, one
layer dismissed per press, containment overriding registration order, and focus
overriding registration order. The sibling Dropdown/Tooltip scenario from the
round-2 review is a test there, and was confirmed failing against the pre-fix
code before the set existed. The Tooltip-inside-Modal and Dropdown-inside-Modal
tests from round 2 are unchanged and still pass.
