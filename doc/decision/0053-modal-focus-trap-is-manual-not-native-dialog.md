# 0053 – The modal's focus trap is manual, not a native `<dialog>`

> Escape handling and the trap's relationship to layers above it were changed
> after this record was written; the current behaviour is in
> `doc/decision/0056-escape-goes-to-the-innermost-open-layer.md`, and the
> passages below marked as such have been brought in line with it. Everything
> else here is unchanged: the choice against a native `<dialog>` stands.

## What

`Modal` is a `<div role="dialog" aria-modal="true">` in a portal on
`document.body`, with its own `keydown` handler (`useFocusTrap`) that keeps Tab
inside. It is **not** a `<dialog>` with `showModal()`, even though a native
element would otherwise be the first choice in this codebase – `Input`,
`Select`, `Checkbox` and `Radio` are all deliberately native elements
(`doc/decision/0012-focus-ring-and-native-elements-in-primitives.md`).

## Why

- **A native `<dialog>` could not be tested.** jsdom implements neither the top
  layer nor its focus containment, and `user-event` **computes tab order
  itself** across the whole document (verified in the `user-event`
  documentation: the Tab handler calls `getTabDestination` and `focusElement`).
  The tests that matter for a modal – "Tab from the last element returns to the
  first" and "Tab never reaches the page behind the dialog" – would, against a
  native dialog, either fail or (worse) pass without proving anything.
- **A property that cannot be verified is a property we do not have.** This is
  the third time on this project that a declared protection turned out not to
  work (twice ESLint, once `tailwindcss` with no entry in `package.json`). For a
  focus trap the cost of failure is higher than it was in those cases: a
  keyboard user "falls through" behind the dialog and has no idea where they
  are.
- A manual handler that calls `preventDefault()` and moves focus explicitly
  behaves **identically under jsdom and in a browser**. The behaviour the tests
  assert is therefore the behaviour that actually ships.
- A native `<dialog>` also brings its own `::backdrop`, which cannot be styled
  from tokens the way the rest is (it sits outside the component's variable
  cascade), and its own `close` event, which would duplicate the controlled
  `open`/`onClose` API.

## How

- `useFocusTrap({ active, containerRef, onEscape })`:
  - on activation it remembers `document.activeElement` and moves focus to the
    first tabbable element inside (or to the container with `tabIndex={-1}`,
    when there is none),
  - on `keydown` it wraps the Tab / Shift+Tab cycle at the container boundary
    **and** at the first/last element (a double safeguard: if focus somehow ends
    up outside, the next Tab pulls it back in),
  - `onEscape` is **not** dispatched by this handler. It is handed to the
    page-wide dismissable-layer tree, which decides whether this container or
    something opened inside it owns a given press
    (`doc/decision/0056-escape-goes-to-the-innermost-open-layer.md`); the
    handler here deals with Tab and nothing else,
  - on deactivation it returns focus to the remembered element – but only while
    the overlay still holds it (including `document.body`, where the browser
    parks focus when the focused element is removed; a check via `contains()`
    alone would practically never restore focus).
- `onEscape` is held in a ref, not in a dependency array. Callers almost always
  pass an inline arrow function; depending on it would rebuild the trap on every
  render, and a rebuild re-runs the initial `focus()` – which would throw the
  caret out of the field the user is typing into.
- "Content behind the dialog is inert" is deliberately handled by the trio of
  `aria-modal="true"` + trap + covering scrim, not by mutating sibling DOM
  nodes. The primitive does not own that DOM and cleaning up such a side effect
  is not reliable; `inert` on siblings is a matter for the application's layout.

### Verification

The trap was verified by mutation, not by reading: temporarily disabling the
Tab branch brought down 3 tests (`cycles Tab…`, `cycles Shift+Tab…`, `takes
focus itself when it contains no controls at all`). That exercise also showed
that one test ("pulls focus back in") passed even with the trap off – the portal
sits at the end of `<body>`, so a forward Tab falls into the dialog on its own.
The test was rewritten to use Shift+Tab, which is the direction that escapes
without a trap.

## Risk

- **The list of focusable selectors is manual** (`FOCUSABLE_SELECTOR`). An
  element with `contenteditable`, or a custom element with `tabindex`, is not in
  it. For the primitives in this lib that is enough; if an editor is ever added,
  the list has to grow.
- **If jsdom ever gains the top layer**, this decision is worth revisiting – a
  native `<dialog>` would remove code. Until then this is the only variant where
  a test means what it claims.

Stacking a second overlay above an open modal was listed as a risk here
originally, on the grounds that a manual trap knows nothing about a top layer.
That is no longer the case: only the deepest, most recent trapping layer traps,
and an outer trap pauses while another trapping layer is registered above it.
See `doc/decision/0056-escape-goes-to-the-innermost-open-layer.md`.
