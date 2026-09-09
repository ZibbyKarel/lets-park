# 0304 – An admin names the holder, and it defaults to themselves

**Date:** 2026-09-09 · **Status:** accepted · **Task:** `TODO.md` item 3, Task 6

## What

`ReservationsService.create` now honours `CreateReservationInput.holder`
(Task 5's discriminated union) instead of always booking for `actor`.
`ReservationPolicy.assertMayNameHolder` is the boundary that decides who may
send a `holder` at all, and what it may name:

```ts
assertMayNameHolder(holder: ReservationHolderInput | undefined, actor: AuthenticatedUser): void
```

## `holder` optional, absence means the caller — the compatibility hinge

Every caller that existed before this task omits `holder` entirely, and the
guard treats an omitted `holder` as always allowed, for anybody: it is exactly
the reservation `create` has always made — the caller, for themselves, no
plate override. This is what keeps every existing test and every existing
client working unchanged; nothing had to migrate to send `{ kind: 'USER',
userId: actor.id, licensePlate: null }` explicitly.

## A normal user may name only themselves

A non-admin who supplies `holder` may only name `{ kind: 'USER', userId:
actor.id }` — the same reservation they would get by omitting it, plate
override included. Naming anybody else, or a guest, is `FORBIDDEN`. The
refusal's `details` names only the attempted `holderKind`, not the `userId` or
guest name that was attempted — the message says what was tried, not who was
probed for.

An admin may name another user, a guest, or themselves — the guard does not
narrow the feature it exists to allow.

## The admin is the actor, so the admin's exemptions apply, not the target's

`assertMayTakeDay` and `assertMayNameHolder` both look at `actor`, not at
`holder`. Booking for another user does not inherit that user's restrictions:
an admin booking on behalf of somebody else is unaffected by the reservation
window (ruling window-1 already exempts admins outright), and the target
user's own role is irrelevant. `PAST_DATE` still applies to everyone,
admin-as-actor included — `assertNotInThePast` has no admin exemption, because
the exemption is about which future months are open, not about rewriting the
past.

## One new audit action, not two

`RESERVATION_CREATED` still means "the holder took it for themselves,"
admin-as-actor or not — an admin booking their own spot is audited exactly
like a normal self-booking. Booking for somebody else is
`RESERVATION_CREATED_BY_ADMIN` (already declared with its payload and entity
type by Task 1), whose payload carries `holderUserId` and `guestName` so the
trail distinguishes a named user from a named guest without a second lookup.
Two actions were considered and rejected: `RESERVATION_CREATED_FOR_GUEST` and
`RESERVATION_CREATED_FOR_USER` would have doubled the audit surface for a
distinction the payload already carries in its two nullable fields.

## The plate is a per-reservation override, never written back to `User`

`holder.licensePlate` (when present) is written only to
`Reservation.licensePlate` — a value scoped to that one booking, matching
`doc/decision/0302-*`. `create` never writes `User.licensePlate`; an admin
correcting a plate for one day's booking must not silently change what the
target user's own future self-bookings default to.

## The target user's existence is a real check

For a `USER` holder naming somebody other than `actor`, `create` reads
`User.findFirst({ id, active: true })` before writing. This is not left to the
foreign key: a nonexistent (or deactivated) `userId` would only produce
`CONFLICT` from Postgres, and an admin who mistyped an id deserves `NOT_FOUND`
instead. The read happens outside the transaction, alongside the existing spot
lookup, for the same reason — it is a lookup, not an invariant the unique
indexes need to arbitrate.
