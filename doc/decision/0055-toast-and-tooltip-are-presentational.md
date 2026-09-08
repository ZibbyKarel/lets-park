# 0055 – Toast and Tooltip are purely presentational

## What

- **`Toast`** is one notification. No queue, no timer, no imperative
  `toast.success(...)`-style API. `ToastRegion` is only a positioning wrapper;
  the list of toasts is supplied by the application.
- **`Tooltip`** wraps exactly one focusable element and writes
  `aria-describedby` **onto that element itself** (via `cloneElement`), merged
  with whatever the caller may already have put there.
- Neither has a model in the design – both are derived from its visual
  language, see below.

## Why

- **A global toast queue is application state, not design-system state.** A
  primitive owning a mutable singleton queue cannot be rendered twice on a page
  or tested in isolation, and it would drag decisions into
  `libs/design-system` (how long a toast stays up, how many stack, what happens
  on navigation) that belong to a feature. A presentational `Toast` +
  `ToastRegion` cover appearance and accessibility; the rest is a few lines of
  `useState` at the call site.
- **A toast must not steal focus.** The entire point of a toast is that it
  reports while the user carries on with their work. It therefore announces
  through a live region rather than by moving focus: `role="status"` (polite –
  the screen reader finishes its sentence) for every tone but `danger`, which
  gets `role="alert"` (assertive, interrupts), because a failure the user is
  meant to react to cannot wait for a pause.
- **`ToastRegion` has to be in the DOM before the message is.** A live region
  that appears with text already inside it frequently goes unread. That is why
  `ToastRegion` is rendered unconditionally and empty – and why there is a test
  for it.
- **`aria-describedby` cannot sit on a wrapper.** Assistive technology reads the
  description from the **focused element's** own attributes; an
  `aria-describedby` one level up describes nothing. It is a mistake that costs
  nothing at render time and everything at use time – hence `cloneElement` onto
  the child, and a test that checks the description via
  `toHaveAccessibleDescription()` on the button rather than via the presence of
  an attribute.
- **A tooltip opens on focus, not just on hover.** A hover-only tooltip is
  invisible to keyboard and touch users; that is the most common way this
  component gets broken. Escape also hides it without moving focus, so the user
  can uncover the content underneath.
- **A tooltip never supplies a name.** A description is read *after* an
  element's name. A control whose only name would come from its tooltip needs an
  `aria-label` – a name that only appears on hover is not a name.

## How

- **The toast's colors are not invented.** The design has its own tinted notice
  block (`background:#FFF4D2; border:1px solid #FFBE0E`). `Toast` generalises it
  into "hundred-step fill plus the full color as the border" for all five tones.
  Every entry in `TONE_CLASSES` is a **complete pair** (background and border in
  one string), so an element never carries one tone's background over another
  tone's border – the same reason as for the `disabled` states, see
  `button.tsx`.
- Only the dimensions are invented: `--toast-w` (380px) and `--tooltip-max-w`
  (240px), both recorded in
  `doc/decision/0052-overlay-tokens-and-one-layering-scale.md`. Otherwise the
  tooltip runs on `--bg-inverse` / `--fg-on-dark` / `--radius-xs` /
  `--shadow-md`, i.e. on the existing palette.
- `ToastRegion` has `pointer-events-none` with an inner `pointer-events-auto`
  stack: otherwise the invisible region would swallow clicks on whatever it
  overlaps – a bug that only shows up in places nobody tests.
- `ToastRegion` is `role="region"`, **not** a second live region. Some screen
  readers read nested live regions twice.
- Escape on a tooltip is dispatched by the page-wide dismissable-layer tree, not
  by a listener the tooltip binds itself, which is also what decides whether a
  merely-hovered bubble or the widget holding the keyboard takes a given press –
  see `doc/decision/0056-escape-goes-to-the-innermost-open-layer.md`.

## Risk

- **The application has to write the queue itself** (and with it auto-dismiss
  and a count limit). It is a few lines, but it is extra work, and two feature
  teams may each write it differently. If it starts repeating, it belongs in
  `libs/design-system/compounds` or in a feature lib – not here.
- **`Tooltip` requires exactly one child that can accept props.** A fragment or
  a text node will fail. The `ReactElement<DescribableChildProps>` type catches
  that in TypeScript, not at runtime.
- **`Tooltip` has no collision detection.** It is positioned purely in CSS
  (`top`/`bottom` plus `left-1/2`), so it can overflow near the viewport edge.
  For labels in a table and on buttons that is enough; automatic flipping would
  mean measuring layout, which a primitive at this layer should not do.
- **`--toast-w` and `--tooltip-max-w` only get checked at visual review.**
