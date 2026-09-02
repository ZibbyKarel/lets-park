# 0092 – Bulk confirmation writes in date order and never lets a statement fail

**Date:** 2026-09-02 · **Status:** accepted · **Affects:** `apps/api/src/reservations/bulk-*`
**Follows on from:** `doc/decision/0065-*`, `doc/decision/0066-*`

## What

`BulkReservationService.confirm` runs the whole batch in **one** interactive transaction, and that
transaction is built on three rules:

1. **Days are written in ascending date order.** The order comes from `allocateBulk`, which sorts
   its own input; the service never writes in request order. Putting the answer back into the order
   the client asked for happens *after* the transaction, in memory.
2. **No statement inside the transaction is allowed to fail.** Both writes are
   `createManyAndReturn({ …, skipDuplicates: true })` — `INSERT … ON CONFLICT DO NOTHING
   RETURNING …`. A day whose spot was taken between the read and the write simply does not come
   back in the returned rows, and the service reads the difference to decide what happened to it.
3. **There is no retry.** A batch that loses a genuine write conflict (`P2034`) fails whole, and
   the caller is told `CONFLICT`.

The transaction takes no `SELECT … FOR UPDATE` and no `FOR SHARE`, and deletes nothing.

## Why

### Ascending date order is the lock ordering

A confirmation holds up to 31 uncommitted `(parkingSpotId, date)` unique keys at once. An
uncommitted key blocks anybody inserting the same key until the holder commits or rolls back — that
is the mechanism `doc/decision/0065-*` found the hard way. Two transactions that take the same two
keys in opposite orders form a cycle, and PostgreSQL resolves a cycle by killing one of them.

Two `confirmBulk`s therefore cannot deadlock *against each other*: both acquire keys in ascending
date order, at most one reservation key per date, so their acquisition sequences are prefixes of the
same total order and no cycle exists. Request order would break it — two users selecting the same
week from opposite ends is not an exotic case, it is two people using a month grid.

The cycle is not hypothetical. `bulk-concurrency.db.spec.ts` builds the other side by hand — a
competitor that takes the later day first, waits, then reaches back for the earlier one — and
PostgreSQL reports `40P01 deadlock detected` every run. What that test proves is that the ordering
constraint is real; the ordering itself is pinned by `bulk-allocator.spec.ts`.

**Honest limit, recorded because it was measured.** Deleting the sort from `allocateBulk` leaves the
entire database suite green (see the mutation table in the task report). The reason is rule 2: each
transaction's reservations go in as a *single* multi-row `INSERT`, so the interleaving that would
form a cycle cannot be forced from outside the process, and the two-caller race in the suite
succeeds either way. The sort is killed deterministically by a unit test instead
(`bulk-allocator.spec.ts`, "comes back in ascending date order, whatever order it was asked in"),
and the cycle it prevents is proven reachable by the hand-built competitor above. Treat the
single-statement insert as the *reason* the sort is currently hard to falsify end to end — not as a
reason to drop the sort: the moment the batch is split into per-day statements (a retry loop, a
savepoint, a per-day hook), the ordering becomes the only thing standing between two users and a
deadlock.

### Why `ON CONFLICT DO NOTHING` instead of a retry

A bulk confirmation must survive *partial* failure: if one of twenty days lost its spot in the
milliseconds since the read, the other nineteen must still be booked. PostgreSQL does not offer
that inside a transaction — a failed statement aborts the whole thing — and Prisma exposes no
savepoints, so `try { insert } catch { … }` around a single day is not available at any price.

`skipDuplicates` moves the decision from the error channel to the result set. The insert cannot
fail, the returned rows say which days were actually taken, and the days that are missing fall
through to the queue exactly as if the read had seen them taken in the first place. The unique
indexes stay the enforcement — nothing here trusts the read.

The alternative was Task 13's shape: catch `P2002`, retry the transaction. For a 31-day batch that
means re-reading and re-writing everything to salvage one day, repeatedly, under exactly the load
that caused the collision. `MAX_CANCEL_ATTEMPTS = 3` is affordable for a single-row cancellation;
it is not the right instrument for a batch.

### Why no `SELECT … FOR UPDATE`, and the race this deliberately leaves open

Locking every candidate spot for every day would close the gap between the read and the write —
and would hold, for the length of a 31-day transaction, a row lock on every spot in the lot,
serialising every other reservation in the building behind one bulk booking. Worse, it would put
`confirmBulk` back inside the lock-ordering cycle that `doc/decision/0065-*` documents for
cancellation, because that path takes `FOR UPDATE` on reservation rows.

So the gap stays open, and it is benign because it is self-correcting: the state can only change
*against* the plan (a free spot becomes taken; a taken one becoming free again cannot help, because
promotion is what frees it and promotion has its own queue). A day that loses its spot lands on the
waitlist for that spot — which is what would have happened had the read seen the truth. The caller
is never told something the database does not agree with: the answer is built from returned rows,
never from the plan.

### Why no retry on `P2034`

`doc/decision/0065-*` retries a cancellation because there is a specific, understood cycle it can
lose and re-running is cheap. Here, a `P2034` means an outside writer took the same cells in an
incompatible order; re-running the whole batch would re-read the world and produce a *different*
plan, which is not a retry so much as a second request the user did not make. `CONFLICT` says
exactly what happened and the client can ask again with the current state on screen. If bulk
confirmations are ever seen losing this race in practice, the upgrade path is a single
`pg_advisory_xact_lock` on the month — the same one `doc/waitlist.md` records for cancellation —
not a bigger attempt count.

## How

- `bulk-allocator.ts` — pure, sorts spots (group then label) and days (ascending), returns a plan.
  Both sorts are re-derived here rather than trusted from the caller, so a `findMany` that lost its
  `orderBy` cannot silently change what a bulk booking books.
- `bulk-reservation.service.ts` — `confirmOnce` reads the world, allocates, inserts reservations,
  derives the days that were lost, inserts queue entries for them, re-reads the queues for their
  positions, writes the audit rows, and returns the events. `preview` runs the same allocation with
  no transaction and writes nothing.
- Events are returned from the transaction callback and published by the caller after it commits —
  the Task 13 seam (`DomainEventPublisher`), unchanged.
- Tests: `bulk-allocator.spec.ts` (preference order, both sorts, tiebreaks),
  `bulk-reservation.db.spec.ts` (writes, audit, broadcasts, forced mid-transaction races),
  `bulk-concurrency.db.spec.ts` (two callers in opposite order; the hand-built deadlock).

## Risk

**A bulk transaction is long by this codebase's standards** — one read pass, two multi-row inserts,
a queue re-read and an audit insert, bounded by `{ maxWait: 5_000, timeout: 15_000 }`. It holds its
keys for that whole window. At single-instance scale with a lot of tens of spots this is
comfortable; it is the number to look at first if reservation latency ever becomes a complaint.

**The plan can be stale by the time it is written**, by design (above). The visible consequence is
that a preview can promise a spot and the confirmation can hand back a queue place instead. The UI
is built for that — the two responses share a shape so they can be laid side by side — but it is a
real thing users will occasionally see.

**Nothing here is multi-instance.** Ordering and unique indexes are properties of the database, so
they survive a second API process; the 15-second transaction budget and the absence of a retry are
tuned for one. Revisit both together, not separately.
