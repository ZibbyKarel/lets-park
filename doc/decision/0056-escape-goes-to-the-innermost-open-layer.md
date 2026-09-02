# 0056 – Escape goes to the innermost open layer

## What

Every overlay in `libs/design-system/primitives` that can be dismissed with
Escape registers with **one page-wide set** (`dismissable-layer.tsx`,
`useDismissableLayer`) while it is open, and unregisters when it closes or
unmounts. The set owns the single `keydown` listener on `document`. No overlay
binds an Escape listener of its own any more.

The set is a **tree**, not a flat list. Each overlay renders a
`DismissableLayerProvider` around its own content naming itself; a layer
registering reads that context to learn its **parent layer**. Nesting is
therefore established at registration time from the React tree, not inferred
from the DOM at press time — see "Why the tree is read from React, not the DOM"
below, which is the whole subject of round 4.

Currently in the set: `Modal` (through `useFocusTrap`, which delegates its
`onEscape`), `Dropdown`, `Tooltip`. `Tabs` and `Toast` are not dismissable by
Escape and are therefore not in it.

One press dismisses **exactly one** layer, chosen in this order:

1. **Deepest wins.** A layer with another dismissable layer open inside it is
   not the target; the nested one is. Nesting is the tree's own parent link.
2. **Then the keyboard.** Layers that are all deepest — unrelated siblings —
   are decided by which one contains `document.activeElement`.
3. **Then the most recent.** Otherwise, last registered wins.

The layer beneath is reached by pressing Escape again.

A layer that passes no `onDismiss` still takes its place in the tree — it has
to be findable as the parent of whatever opens inside it — but is never the
target of a press and never blocks the layer nested within it from being one.

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
- **Round 3** — the set itself, with rule 1 answered by `element.contains()`.
  That is correct for `Dropdown` and `Tooltip`, which render inline, and
  silently wrong for `Modal`, which portals to `document.body`: two modals
  nested in JSX are DOM *siblings*, so neither contains the other and the rule
  could not see the nesting at all. Combined with the focus defect below, one
  Escape press on a confirmation modal opened inside a settings modal dismissed
  the **outer** one, unmounting its whole subtree and taking the inner modal —
  and a tooltip open inside that — with it. Three layers, one press, no test
  anywhere that nested two modals.

All three failures share a cause: mount order, listener phase and DOM position
are properties no overlay controls and none of them is what "topmost" means.

## Why the tree is read from React, not the DOM

`Modal` renders through `createPortal(..., document.body)`, so where its markup
*is* has nothing to do with where it was *opened*. Any rule built on
`element.contains()` is guessing for exactly the one overlay in the set whose
dismissal unmounts a whole subtree.

React context is the mechanism that solves this: a portalled child still sees
the context of its React parent, not of its DOM parent. So each overlay
publishes itself through `DismissableLayerProvider`, and a layer registering
inside it picks that up as its parent. The result is the true logical nesting
regardless of where anything portals to. This is the same approach Radix UI
takes in its own `DismissableLayer`, and for the same reason.

The DOM is still consulted for one thing only — rule 2, "does this layer
contain `document.activeElement`?" — where it is the right question, because
focus is a DOM fact.

## The focus trap has to be layer-aware too

Round 3's bug had a second half. `useFocusTrap` focuses the first tabbable
element inside its container when it activates, and child effects run before
parent effects, so an outer modal ran that step *after* the inner one. Rooted at
the outer dialog, `querySelectorAll` cannot see the inner modal's portalled
subtree, so the outer trap found nothing, focused its own container, and pulled
the keyboard out of the overlay actually on top. Rule 2 was then being handed a
`document.activeElement` that lied.

So **only the deepest, most recent focus-trapping layer traps**. An outer trap
pauses while a trapping layer is registered above it and resumes when that layer
unregisters; pausing releases Tab only and never moves focus, because the layer
that is closing owns focus restoration. Non-trapping layers — a tooltip or a
menu opened inside a modal — do not pause that modal's trap; a second modal
does.

Fixing only the tree would have left this defect alive, and it corrupts the
tie-break the tree depends on. That is why round 4 changed both.

A fourth patch to the phase — or
`stopImmediatePropagation()` — would only have produced a fourth ordering bug.
Making the question structural, and reading the structure from the tree that
actually describes it, is the only version that does not depend on which
component happened to mount first or where it happened to render.

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
- **A React context provider holding the whole stack.** Rejected in round 3 and
  still rejected, but the reason needs stating precisely, because round 4 does
  now use a context. What was rejected is a provider *the application* must
  mount above every overlay: a primitive cannot enforce that, and forgetting it
  would fail silently. What round 4 adds is different — each overlay renders its
  own provider around its own content, so there is nothing for an application to
  remember, and the context carries only "who is my parent", never the set of
  open layers. The open set stays module-level. The trade-off is unchanged: one
  set per JS module instance, correct for one app bundle, and what the tests
  exercise. A second copy of this lib in the same page would get its own set.
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

- `useFocusTrap`'s `keydown` listener handles Tab only, and binds it only while
  this trap is the active one. `onEscape` is unchanged for callers; omitting it
  makes the container one Escape never selects, so a press falls through instead
  of being absorbed — but the container is still in the tree, because a nested
  overlay has to be able to find it.
- `useFocusTrap` now returns its layer node, and `Modal` publishes it. An
  overlay that traps focus but does not publish its node is one nothing can name
  as a parent — a silent regression, so it belongs in review.
- `Dropdown`'s menu `onKeyDown` no longer has an `Escape` case, and no longer
  calls `stopPropagation()` for it.
- Public props of all five overlay primitives are unchanged.
- The set does not claim Escape from application-level `document` listeners: it
  neither calls `stopPropagation()` (there is nothing above `document` to stop)
  nor runs in the capture phase, so handlers inside the tree still see the
  event first and can `stopPropagation()` to override the set.
- An overlay added later that must be Escape-dismissable belongs in the set.
  Adding one means passing `active` and its outermost node, and rendering a
  `DismissableLayerProvider` with the returned node around its own content.
- The file is `dismissable-layer.tsx` rather than `.ts`, because it exports the
  provider component.

## Verification

`dismissable-layer.spec.tsx` covers the tree's contract directly: LIFO order,
out-of-order removal, unmount while open, a layer opened and closed inside one
tick, one listener for the whole set, one layer dismissed per press, nesting
overriding registration order, focus overriding registration order among
siblings, dismissal with `document.activeElement === document.body`, and the
trap pausing in both shapes it matters — a modal opened inside another (where
the outer trap cannot see past the portal) and two unrelated modals (where two
live traps would fight over every Tab).

The reviewer's own scenario is a test: an outer modal containing an inner modal
containing a tooltip, where one Escape must leave two of three layers standing.
It was confirmed failing against round 3's code first — the whole `<body>` was
an empty `<div />` after a single press.

Every rule here was mutation-tested: severing the parent-from-context link, and
neutering the deepest-layer selection, the focus tie-break, the trap pausing,
and the trap's subscription to the set each fail tests, and each fails a
different set of them. The sibling Dropdown/Tooltip scenario from the round-2
review and the Tooltip-inside-Modal and Dropdown-inside-Modal tests from round 2
are unchanged and still pass, and are still load-bearing under those mutations.
