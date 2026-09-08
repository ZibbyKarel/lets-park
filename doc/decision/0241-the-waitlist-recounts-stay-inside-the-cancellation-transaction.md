# 0241 – The waitlist recounts stay inside the cancellation transaction

## What

`ReservationsService.cancelOnce` keeps its `SELECT count(*)` per emptied cell
where it is: inside the transaction, before the commit. The proposal to move the
recounts after the commit — the events are published on the resolved outcome
anyway, so the arithmetic does not have to be transactional — was considered and
rejected.

## Why

`0234` closes with a Risk section naming the hazard: "one extra `SELECT
count(*)` per emptied cell, inside a transaction that is holding row locks". When
the deadlock in `0240` turned up, that comment was the obvious suspect, and the
proposed remedy was to recount after commit and accept a small staleness window
in exchange.

The counts are not the cause, and they cannot be. `SELECT count(*)` with no
`FOR UPDATE` takes no row locks at all — it is an MVCC snapshot read against a
table this transaction already holds `ACCESS SHARE` on. It cannot enter a
lock-wait cycle, so it cannot be a party to a deadlock or a victim of one. The
server log agrees: across 32 measured runs of the database suites, with 20
deadlocks in the cancellation path, the victim was always either the promotion's
`INSERT` or the cross-cell `DELETE`, and never a `count`.

So moving them would have bought nothing, and it is not free:

- **It would introduce a staleness window that does not exist today.** A recount
  after commit can observe a queue that a concurrent `join` or `leave` has since
  changed, and emit a `waitlist:updated` carrying a number that was never true at
  any single instant. It is true that the concurrent write emits its own event —
  but ordering between the two is then unconstrained, and the *later*-delivered
  event wins in `day-overview-cache.ts`. A stale badge is exactly the defect
  `0234` set out to fix; curing it by a different route is not a fix.
- **It would need a second connection.** After `$transaction` resolves the `tx`
  client is dead, so the recount would go through `PrismaService` — a separate
  pooled connection, and one more thing that can fail on a path where the
  cancellation has already committed and cannot be undone.
- **It would be an unexplained divergence.** The freed cell's own `waitlistCount`
  has been read inside the transaction since long before `0234`. Moving the
  other cells' counts out would leave two cells in one event batch counted under
  two different consistency rules.

The cost of leaving them is what `0234` already stated and bounded: one extra
round trip per *other* cell the promoted person was queued on, at most the number
of spots, in practice zero or one, sequential rather than fanned out.

## How it is kept true

Nothing new. `reservations.db.spec.ts` ("promotes the head of the queue and
clears their other queues that day") asserts the exhaustive event list and both
`waitlist:updated` payloads by value, so a recount that started reading the
wrong thing — or stopped happening — fails there. Confirmed by mutation:
dropping the other-cell events turns that assertion red on the missing third
event.

## Risk

The real hazard `0234` gestured at is unaddressed, because it is not a hazard at
this size: the transaction is longer than it strictly needs to be. If the number
of spots one person can queue for on one day ever grows to where the recounts
measurably lengthen the lock hold, the fix is the `pg_advisory_xact_lock`
upgrade path already documented in `doc/decision/0065-*`, not a partial move of
some queries out of the transaction.
