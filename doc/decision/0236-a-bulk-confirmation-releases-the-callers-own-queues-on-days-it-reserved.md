# 0236 – A bulk confirmation releases the caller's own queues on days it reserved

## What

`BulkReservationService.confirmOnce`, immediately after `createReservations`,
deletes the caller's remaining `WaitlistEntry` rows for the dates it just
reserved (`releaseOwnQueues`, a `DELETE … RETURNING`), and emits one
`waitlist:updated` per cell it emptied.

## Why

Holding a reservation and a queue entry on the same day is a state the rest of
the module treats as invalid, from both sides:

- `WaitlistService.join` refuses it at the door, with
  `RESERVATION_LIMIT_REACHED` and an explicit reason: "the queue would accept
  them and then silently never promote them".
- `WaitlistPromotionService.promote` cleans it up on the other side, deleting
  every entry the promoted person holds for the day.

`confirmBulk` was the one writer that could create it. `allocateBulk` refuses a
day the user already has a *reservation* on, and `queueTargets` refuses to queue
a day they acquired one on mid-transaction — but nothing did the reverse: a day
on which the user **already held a queue entry** and the batch now assigned them
a spot. `readWorld` reads the day's waitlist, but only for queue lengths; the
pre-existing entry was left in place.

Nothing corrupts — `firstEligible` skips somebody who already holds the day, so
the entry simply never fires. The user's day screen shows them queued for a spot
they can never be promoted into while they hold their own, and it stays that way
until they notice and leave it by hand.

## How

`DELETE … RETURNING "parkingSpotId", "date"` rather than `deleteMany`, for the
same reason as `doc/decision/0234-*`: the cells have to be named in the
broadcast, and only the delete knows which they were. The dates are bound in
ascending order, the same ordering `createReservations` uses to keep two
concurrent confirmations from deadlocking. The recount per cell is sequential —
this runs inside a transaction holding row locks.

The affected cells cannot collide with the batch's queue targets: `queueTargets`
only ever names days the batch did **not** reserve, and this only touches days
it did.

## Risk

One `DELETE` and one `count` per emptied cell added to a transaction that is
already the longest in the application. The `DELETE` matches at most one row per
day in the batch (`WaitlistEntry` is unique on `(parkingSpotId, userId, date)`
and a user can hold at most one queue entry per spot), so the added work is
proportional to the batch, not to the lot.
