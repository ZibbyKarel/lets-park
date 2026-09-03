# 0167 – A spot failure belongs to one attempt, and dies with it

## What

On the "Parkovací místa" tab, the failure of a write is thrown away the moment
the open dialog changes, and it is only ever rendered on a surface that could
have started it.

Two mechanisms, deliberately independent:

- `AdminSpotsScreen` routes every dialog change through `changeDialog()`, which
  calls `onDiscardFailure()` first. `AdminSpotsPanel` implements that by
  resetting all three mutations and clearing `lastWrite`.
- `WRITE_ORIGINS` (in `admin-spots-screen.tsx`) says which surfaces each write
  can have come from — `spotCreate` only from the create form, `spotRevive` only
  from a row switch, and so on. `failureShownIn` renders nothing for a pairing
  that is not in it.

## Why

The review of this branch reproduced a real defect. `failureShownIn` chose
*where* to print the current failure, but nothing cleared the failure itself
except the start of the next write. So:

1. an admin presses **Smazat** on E2.92;
2. the API answers `CONFLICT` — somebody holds it today — and the confirmation
   stays open with the right sentence;
3. the admin presses **Zrušit** and then **Přidat místo**;
4. the empty "Nové parkovací místo" form opens already saying *"Na tomto místě
   jsou rezervace ode dneška dál. Nejdřív je zrušte."*

The mirror case is worse: a refused **Přidat místo** followed by **Smazat** told
the admin their deletion was refused for a duplicate label.

This is the same failure shape as the settings screen's, and worse in one
respect: the sentence is *confidently specific*. A vague error invites a retry;
a precise one about the wrong operation invites the admin to go and cancel
reservations that do not exist.

Discarding alone would have been enough for the reported cases. It is not enough
on its own to make the shape unrepresentable — the discard is a call somebody
can forget to make from a new code path, and a forgotten call fails silently.
`WRITE_ORIGINS` is a table, so a new surface has to be added to it before its
failures can render anywhere at all, and the default for an unlisted pairing is
silence.

## How

- `changeDialog(next)` is the only writer of the dialog state. Open, swap,
  cancel and close-after-success all go through it.
- `AdminSpotsPanel.discardFailure()` calls `reset()` on the create, update and
  deactivate mutations and sets `lastWrite` to `null`. `startWrite` now calls it
  too, so a new attempt still clears the previous one.
- `failureShownIn(where)` computes `home` as the open dialog's `kind`, or
  `'table'`, and returns `null` unless `WRITE_ORIGINS[writeErrorFrom]` contains
  that home.
- Covered by four tests in `admin-spots-screen.spec.tsx` (§"a failure the admin
  has walked away from") — including a stateful harness that reproduces the
  reported click sequence end to end — and one in `admin-panels.spec.tsx`
  ("forgets a failure when the admin opens a dialog"), which proves the panel's
  `reset()` really clears TanStack's own state rather than the screen merely
  hiding it.

## Risk

- **`WRITE_ORIGINS` is a second place to update.** A new dialog, or a new write
  reachable from an existing one, needs an entry or its failures go unreported.
  The failure direction is silence rather than a wrong sentence, which is the
  right way round, but silence is still a bug. The table sits directly above the
  function that reads it, and both are named in this record.
- **The discard is unconditional.** Cancelling a dialog also throws away a
  failure that came from the table behind it. That is intended — the admin has
  moved on — but it means a row switch that failed while a dialog was later
  opened and closed leaves nothing on screen. The row's state still reflects the
  API, because the list is refetched on settle.
