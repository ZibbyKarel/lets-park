# 0235 – Retiring a spot is blocked by its queue as well as its reservations

## What

`SpotsService`'s deactivation check counts `WaitlistEntry` rows from today
onwards alongside `Reservation` rows. Same `CONFLICT`, same shape; the `details`
payload is now `{ reservations, waitlistEntries }` and the message names both.

The method was `requireNoFutureReservations`; it is now
`requireNoFutureCommitments`, because it no longer checks only reservations.

## Why

The check counted `Reservation` rows only. `WaitlistEntry` rows were neither
counted, refused, nor deleted — so a spot could be retired with a live queue on
it.

That is reachable without anybody making a mistake. A cancellation whose whole
queue is ineligible — everyone in it already holds a reservation that day —
returns `null` from `promote`, leaving the queue in place while the spot goes
free. An admin then deactivates the spot, correctly seeing no reservations.

Those entries now reference a spot `SpotsService.listActive` filters out. The
day overview never renders the cell, so the user cannot see or reach their
entry; `leave` needs an entry id they have no way to obtain; and nothing will
ever promote it, because nothing will ever free a spot nobody can reserve. The
row survives — `ON DELETE RESTRICT`, `doc/decision/0027-*` — but it survives
invisibly, which is the worst of the three options.

The file header's `ON DELETE RESTRICT` reasoning explains why the *row* is not
deleted. It says nothing about why the *queue* should be allowed to outlive the
spot.

## Why refuse rather than clean up

The report offered both: block, or delete the entries in a transaction and
broadcast a `waitlist:updated` per cell. Blocking was chosen because it keeps
the operation's shape — one boolean flip, no side effects, no broadcast, no
transaction — and because silently deleting somebody's place in a queue is the
kind of thing an admin should have to do on purpose. The admin can clear the
queue explicitly (an admin may `leave` on anyone's behalf) and then retire the
spot; the two-step version is legible in the audit log, and the one-step version
would not have been.

## How it is kept true

`spots.service.spec.ts` gains "refuses while somebody is only *queued* for the
spot, with no reservation left" — a spot with one future waitlist entry and no
reservation at all — and its past-dates counterpart now seeds a past queue entry
as well as a past reservation. `PrismaDouble` gained `waitlistEntry.count` with
the same `date.gte` contract as the reservation count, refused the same way if
the bound is missing.

## Risk

An admin retiring a spot whose queue is stale now gets a `CONFLICT` where they
used to get a success. That is the point, but it is a new way for an
administrative action to fail, and the message has to be good enough to act on —
it names both counts.
