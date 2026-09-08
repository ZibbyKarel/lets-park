# 0163 – "Smazat" retires a spot, and says so when it cannot

## What

The red **Smazat** button in the "Parkovací místa" tab
(`doc/design/screens/04-admin-spots.png`) opens a confirmation and then calls
`admin.spot.deactivate`, which sets `active: false`. No spot row is ever
deleted.

When the API refuses — somebody holds the spot today or later — the dialog
stays open showing `spotsDeleteConflict`:

> Na tomto místě jsou rezervace ode dneška dál. Nejdřív je zrušte.

## Why

The brief asked for a deliberate choice between *refusing the delete* and
*deactivating the spot*. The schema and the API had already made it, and this
record writes it down rather than re-deciding it:

- **Deletion is impossible, not merely discouraged.** `Reservation`,
  `WaitlistEntry` and `AuditLog` all reference `ParkingSpot` with
  `ON DELETE RESTRICT` (`doc/decision/0027-*`). A `DELETE` would be refused by
  Postgres, and cascading it would destroy the audit trail the whole application
  is built to keep.
- **So the contract has no delete.** `admin.spot.deactivate` is the only
  retirement procedure, its output is a `ParkingSpot` (not a void), and it
  declares `CONFLICT` — which `SpotsService.requireNoFutureReservations` raises
  while any reservation exists for today or later.
- **And the refusal is the right behaviour, not a limitation.** Silently
  retiring a spot under somebody who has already parked on it would leave them
  believing they have a place. The admin has to cancel those reservations first.
  `>=` today, not `>`: a reservation for *today* is one somebody is standing on.
- **The button still says "Smazat", because the design does.** The word an
  admin reads and the operation the system performs differ, and that is
  acceptable only because the dialog says what actually happens:
  `spotsDeleteDescription` states that the spot disappears from the lot, that
  the reservation history survives, and that the deletion is refused while
  somebody holds it.

## How

- `AdminSpotsScreen` keeps one `dialog` state (`create` / `edit` / `delete`).
  The `delete` case renders `ConfirmDialog` (`doc/decision/0071-*`) with
  `tone="danger"`; a rejection leaves it open, because the sentence inside it is
  the retry affordance.
- The inline **Aktivní** switch turned off is the same operation by another
  route: `SpotsService.update` runs the identical
  `requireNoFutureReservations` check when `active` goes to `false`, precisely
  so that `update({ active: false })` is not a way around `deactivate`. The UI
  therefore reports both as `spotRetire` in `./admin-errors.ts` and both get
  this sentence.
- Turning a spot back **on** is `spotRevive`, which deliberately maps no
  `CONFLICT` at all: reviving collides with nothing, and claiming a duplicate
  label or a live reservation would be inventing a cause.
- `spotsDeleteConflict` exists because the generic `errors.CONFLICT` — "Někdo
  jiný mezitím provedl stejnou změnu" — is a false explanation here. Nobody
  raced anybody; the spot is simply booked.

## Risk

- **A retired spot is still in the table**, badged `Neaktivní`, and its "Stav
  dnes" is a dash rather than "Volné" (it is absent from the day overview
  entirely). An admin expecting the row to disappear will be surprised; the
  badge is what tells them otherwise, and the switch is how they undo it.
- **The refusal names no reservations.** `requireNoFutureReservations` puts the
  count in the error's `details`, and this screen ignores it. Showing "3
  rezervace" would be more useful; showing *which* would need a procedure the
  contract does not have. Left for a task that adds one.
