# 0111 – A lapsed hold is broadcast, because the client deliberately does not poll

**Date:** 2026-09-03 · **Status:** accepted · **Task:** 15 (the Socket.io gateway)

## What

`LockService` schedules **one timer per hold**, rescheduled on every renewal and cleared on
every release. When it fires, the lock is dropped from the map and every registered
`onExpired` listener is called; the gateway's listener broadcasts `cell:unlocked` into the
day's room.

So a hold reaches a client's tile as `cell:unlocked` on **all four** of its endings:

| how the hold ends | what fires |
| --- | --- |
| the holder closes the form (`cell:unlock`) | `RealtimeGateway.cellUnlock` |
| the holder's socket drops | `handleDisconnect` → `LockService.releaseSocket` |
| **the TTL lapses with nobody saying anything** | **the per-hold timer → `onExpired`** |
| the holder loses the cell to a supersession | nothing — see below |

The third row is this decision. It was parked at Task 21 as an open question and is confirmed
here.

## Why this is not bookkeeping

`useCellLock` puts a contended cell into `held-by-other` and then **sits still**. That is
deliberate and documented (`doc/realtime.md`, §"What the hook deliberately does not do"):
polling a contended cell from every open tab is exactly the traffic the broadcast exists to
avoid. The hook has no timer on `held-by-other` and no retry loop.

Which means: **if the server never says the hold ended, the client never learns it did.** The
scenario is ordinary, not exotic —

> Two colleagues open the same cell. A holds it; B's tile reads "právě upravuje Alice". A's
> laptop lid closes. A's browser is suspended, so no `cell:unlock` is sent, and depending on
> how the connection dies the server may take until `pingTimeout` to notice — or, if A's
> process is killed while the TCP connection stays half-open, may not notice promptly at all.
> Without the expiry broadcast, B's tile says Alice is editing until B reloads the page. The
> spot is free and looks taken.

The `cell:locked` payload carries `expiresAt` precisely so a client *could* clear the state
itself, and the schema comment says so. But `useCellLock` does not currently do that — it
stores `expiresAt` and renders it, with no timer. So today the server's broadcast is not
redundancy, it is the mechanism. That asymmetry is recorded as a follow-up in the Task 15
report: a client-side timer on `expiresAt` would make the two independent, and neither task
should assume the other did it.

## Why per-hold timers and not a sweep

A single sweeping interval was the alternative and is worse on both axes.

- It **fires forever on an idle server**: a lot with nobody editing anything still ticks.
- It makes expiry **granular to the sweep period**, so `cell:unlocked` would arrive up to one
  period after the `expiresAt` every client was told about. A tile that clears late is the
  same defect, smaller.

There are never more timers than there are open editing forms, and every one is `unref`ed, so
a pending hold can never be the reason the process refuses to exit. `onModuleDestroy` clears
them all, so none fires into a closing server.

## The supersession case, and why it is silent

A hold can be past its `expiresAt` while its timer has not yet run — a busy event loop, or a
test's clock. If a rival asks for the cell in that window, `acquire` drops the stale hold
**without notifying** and grants the cell.

Notifying there would be a bug, not thoroughness: the gateway is about to broadcast
`cell:locked` for the new holder, and a `cell:unlocked` arriving after it would clear, on every
client in the room, a hold that is live. One committed change, one event about the cell — the
same rule `doc/decision/0022-*` applies to reservations.

`lock.service.spec.ts`, "does not announce a lapse for a cell that was handed straight on".

## How it is verified

Both halves, and the negative:

- `lock.service.spec.ts` (fake timers) — "announces a hold that lapses, with its holder",
  "does not announce it early", "announces it once, not once per tick", "stops the expiry, so
  a released cell is not announced twice", and the supersession case above.
- `realtime.gateway.spec.ts` (real sockets, real TTL of 800 ms) — "is broadcast as
  `cell:unlocked` when it lapses", "is actually free afterwards, not merely announced" (the
  broadcast is not a lie), "is not announced early", and "is released, and announced, when the
  holder's socket drops".

The gateway suite runs against a short `REALTIME_LOCK_TTL_MS`, which is why every wait in it
matches on the payload as well as the event name: with a sub-second TTL the server is
legitimately emitting `cell:unlocked` for cells earlier tests abandoned, and an assertion that
accepted any of them would pass for the wrong reason.

## Risk if this is wrong

**A listener that throws would stop the ones after it.** There is exactly one listener today
(the gateway's), and its `emitToDay` never throws — it validates, logs and returns. If a
second listener is ever added, the loop in `expire()` needs a `try` around each call.

**The multi-instance upgrade path is the weak point.** Redis keyspace notifications are
best-effort, so a clustered deployment would have to pair them with a sweep — the thing this
decision rejected for the single-instance case. That is recorded in `LockService`'s own
comment and in `doc/realtime.md`; it is not built, because an unused implementation is an
untested one.
