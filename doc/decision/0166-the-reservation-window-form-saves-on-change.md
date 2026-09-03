# 0166 – The reservation-window form saves on change, and keeps one audit action

## What

The "Otevření nového měsíce" card has **no Save button**. Every press of the
stepper and every lock-mode pill calls `admin.window.update` immediately, with
both fields.

Changing a user's role and deactivating a user both keep writing the existing
`USER_UPDATED` audit action; no new action was added for either.

## Why

### Saving on change

- **The design has no Save button** (`doc/design/screens/05-admin-window.png`),
  and the card next to it says *"Podle nastavení vlevo · dnes je …"* — it is a
  live read of the setting beside it. A form with an unsaved pending state would
  make that sentence false for as long as the state was pending.
- **It matches the rest of the section.** Every switch in the users and spots
  tabs applies immediately; a stepper that needed confirming would be the odd
  control out.
- **The cost is bounded.** `openDaysBefore` is 1–31, so the worst case is a
  handful of requests from a handful of admins, on a screen nobody sits in.
- The contract's `admin.window.update` is a **replacement, not a patch** — its
  input *is* the settings schema, so an omitted field falls back to its default
  rather than to the stored value. Both fields are therefore always sent, which
  is why `onChange` takes `{ openDaysBefore, lockMode }` and never one of them.

### Not splitting `USER_UPDATED`

`doc/decision/0059-*` gave reservation-window changes their own action, and
`0091-*` gave joining a waitlist its own. Both did so for the same stated
reason: **no existing member could describe the event**. `USER_UPDATED` can
describe both of ours —

- it names the right entity (`User`), which `RESERVATION_*` and `WAITLIST_*` do
  not;
- its payload already carries `before`/`after` for **both** `role` and `active`,
  so "who demoted whom, and when" and "who offboarded whom, and when" are both
  answerable from a single row;
- splitting it into `USER_ROLE_CHANGED` / `USER_DEACTIVATED` would leave a
  single call that changes both fields with no action to write, since
  `adminUpdateUserInputSchema` allows exactly that.

Following 0059's *pattern* means adding an action when nothing describes the
event — not adding one per field.

## How

- `AdminWindowPanel` holds an `isSaved` flag, set on a successful save and
  cleared by the next change, so `windowSaved` ("Nastavení uloženo.") confirms
  the save that just happened and not one from five minutes ago. A failure
  suppresses it: `AdminWindowScreen` renders the confirmation only when
  `saveErrorMessage === null`.
- Both controls are disabled while a save is in flight, so a second press cannot
  race the first.
- A successful save invalidates `api.admin.window.key()` (the month list is
  derived from these two fields) **and** `api.overview.key()` (the day overview
  embeds the window state of its own month, and the lot banner is drawn from
  it).

## Risk

- **A stepper held down produces a request per press.** No debounce, by choice —
  see above. If this ever matters, the fix is a debounce in
  `AdminWindowPanel.onChange`, not a Save button, because the Save button is the
  thing the design does not have.
- **Every press is an audit row.** `RESERVATION_WINDOW_UPDATED` is written on
  each save, so walking the stepper from 7 to 14 leaves seven rows. That is
  noisier than one row per intent, but it is also the truth about what happened,
  and the audit table's job is to record writes rather than intentions.
