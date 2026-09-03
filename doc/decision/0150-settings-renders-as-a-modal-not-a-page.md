# 0150 – `/nastaveni` renders as a `Modal`, not a bespoke dialog shell

## What

`apps/web/src/shell/settings-screen.tsx` renders the whole settings screen —
licence plate, preferred spot, and the ICS section (`doc/decision/0151-*`) —
inside the design system's `Modal` primitive
(`libs/design-system/primitives/src/lib/modal.tsx`), reached at the
`/nastaveni` route. Closing it (Cancel, ×, Escape, the scrim, or a successful
save) pushes back to `LOT_ROUTE` (`/`), so the "page" is really an overlay on
top of the parking overview.

## Why

- **`doc/design/screens/11-settings.png` already draws it as a dialog** — a
  centered card with a title, a description, a form, and a
  Cancel/Uložit footer over a dimmed background — which is exactly `Modal`'s
  shape (`title` / `description` / `footer` / `size` props). Building a second,
  hand-rolled dialog shell to reproduce that would duplicate a primitive the
  design system already ships, for no visual difference.
- **`Modal` already carries the accessibility work this screen needs**: a
  portal to `document.body`, a focus trap, `Escape`-to-close, and
  scrim-click-to-close (`closeOnScrimClick`). Settings has no requirement that
  would justify reimplementing any of that.
- **The route still exists on purpose.** `/nastaveni` is a real, linkable,
  reloadable URL — the avatar menu's "Nastavení" item and a direct paste of
  the link both work — even though what it renders is an overlay. This mirrors
  how the design presents it: something you open from the top bar, on top of
  wherever you already were, not a screen you navigate into and lose your
  place.
- **Primitives and compounds stay presentation-only** (root `CLAUDE.md`,
  design-system-first rule): `Modal` knows nothing about the profile, the
  form, or oRPC. All of that domain wiring lives in `SettingsScreen` (tested
  with plain props) and `SettingsPage` (untested wiring), which is exactly the
  split `AdminScreen`/`sprava/page.tsx` and `TopBar`/`AppTopBar` already use
  elsewhere in this codebase.

## How

- `SettingsScreen` always renders `<Modal open onClose={onClose} ...>` —
  there is no "closed" state to model, because the only way to be looking at
  this component at all is via the `/nastaveni` route.
- The footer is `undefined` while the profile is still loading or failed to
  load (`ready = !isPending && !isError && profile !== undefined`), so the
  Cancel/Save buttons cannot appear over a form that has not been seeded yet —
  `ScreenLoading`/`ScreenError` render as the modal's children instead, reusing
  the same components every other screen's loading/error states use.
- `onClose` is one callback, invoked identically by every exit path `Modal`
  itself recognises, plus a successful save (`SettingsPage`'s
  `updateSettings` mutation calls `router.push(LOT_ROUTE)` from its
  `onSuccess`). There is no separate "did the form change" confirmation on
  close — Cancel discards silently, matching the design, which shows no
  "unsaved changes" affordance.

## Risk

- **A modal-shaped route cannot deep-link to a sub-state** (e.g. "settings,
  scrolled to the ICS section") without a query string this implementation
  does not add. Not needed today: the screen is short enough to see both
  sections without scrolling on the design's target viewport.
- **Closing on save is not undoable.** If `updateSettings` succeeds but the
  user meant to keep editing, they must reopen `/nastaveni` and start again.
  This matches the "Uložit" button's implied contract (save closes) and the
  design has no separate "save and keep open" affordance to preserve instead.
