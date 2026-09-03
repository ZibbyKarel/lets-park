# 0173 – The locked month is blocked in the modal, not only hidden in the header

**Date:** 2026-09-03 · **Status:** accepted · **Affects:** `apps/web/src/lot/bulk-modal.tsx`,
`apps/web/src/lot/lot-screen.tsx` · **Follows on from:** `doc/decision/0120-*`

## What

`day.canReserve` is used **twice**, for two different jobs:

1. `LotHeader`'s `showBulk` — the entry point is absent for a normal user in a locked month.
2. `BulkReservationModal`'s `canReserve` prop — when it is `false` the modal renders a refusal
   ("Rezervace jsou uzamčené") **instead of** its flow: no grid, no schedule, no call to action,
   and therefore no `previewBulk` and no `confirmBulk`.

The second check runs ahead of all three steps, so it also catches a window that closes while the
modal is already open.

## Why

**Hiding a control is not enforcement, and the two halves fail in different situations.** The
header's `showBulk` answers "should this user be invited to start", once, at render. The modal's
`canReserve` answers "may this flow proceed", continuously. Only the second covers the case that
actually happens: the user opens the modal on an open month, the day query refetches (a realtime
broadcast, a window focus, an admin changing the window), `canReserve` flips, and the user is now
holding a proposal for a month they may no longer write to. A hidden button is behind them at that
point.

**Neither is authorisation.** The API's window check is (`doc/decision/0120-*` — `canReserve` is
the backend's answer, not a re-derivation), and `confirmBulk` answers `RESERVATIONS_LOCKED`
regardless of what the client believes. What the client owes is (a) not inviting an action that
cannot succeed, (b) not letting a flow continue into a request that will be refused, and (c) saying
so in words when the API refuses anyway. All three exist; (c) is `doc/decision/0171-*`'s
`errorLocked`.

**Why the day's answer stands for the month's.** The reservation window is monthly
(`day.window.month`), the grid shows exactly the month of `anchorDate`, and `anchorDate` is the lot
screen's day. So `canReserve` for that day *is* the answer for that month, taken from the field the
contract tells us to read rather than re-derived from `window.state` — the re-derivation
`lot-screen.spec.tsx` already names as a live hazard.

**One authority, not a guard plus a rendering branch.** The obvious extra defence — an
`if (!canReserve) return;` at the top of the mutate handlers — was written and then removed. With
the body already replaced by the refusal there is no control left to click, so nothing could ever
falsify it, and `doc/decision/0092-*` §"One authority" is this project's record of what an
unfalsifiable guarantee costs: two mechanisms, either sufficient, neither killable by a test, and
every document pointing at only one of them. The rendering branch is the single authority and a
named test fails when it is deleted.

## How

- `apps/web/src/lot/lot-screen.tsx` — `showBulk={day.canReserve}` (unchanged from Task 24) and
  `canReserve={day.canReserve}` on the modal, with the reason at the call site.
- `apps/web/src/lot/bulk-modal.tsx` — the `if (!canReserve)` branch sits above the result, schedule
  and select branches, so it wins on every step.
- Proven separately, as two named tests in `bulk-modal.spec.tsx`:
  - *"refuses the whole flow when the caller may not reserve in this month"* — the modal opened
    with `canReserve: false` shows the refusal, has no column headers and no CTA, and
    `previewBulk` was never called.
  - *"stops a confirmation whose window closed while the modal was open"* — the flow is driven to
    the proposal with `canReserve: true`, the component is re-rendered with `false`, and the
    confirm button is gone with `confirmBulk` never called.
  The hidden half stays where it already was, in `lot-screen.spec.tsx` › *"hides the button when
  canReserve is false, even though the window is OPEN"*.

## Risk

**An admin sees the modal in a locked month, because `canReserve` is `true` for them** — that is
the intended behaviour (`doc/decision/0120-*`), and the API agrees, so nothing here special-cases a
role.

**A window that closes mid-flow throws the selection away.** The refusal replaces the body, and
going back is not offered; if the window reopens the user starts again. Preserving a selection
across a lock would mean keeping state for a request that may never become legal, which is a worse
trade than a re-pick.
