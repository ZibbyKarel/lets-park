# 0141 – The old-room unsubscribe is proven at the hook that derives both

## What

Two named tests were added to `apps/web/src/lot/use-lot-realtime.spec.tsx`:

- `unsubscribes from the old room when the day changes` — rerenders the
  harness from `DATE` to `OTHER_DATE` and asserts the room events are exactly
  `join(DATE)`, `leave(DATE)`, `join(OTHER_DATE)`, in that order.
- `patches the new day's cache entry after the day changes, not the old one`
  — after the same rerender, an event for `OTHER_DATE` patches
  `overview.day`'s cache entry for `OTHER_DATE`, and the entry for `DATE` is
  untouched.

Getting there required changing the file's `@lets-park/realtime-client` mock:
`useDayRoom` had been a bare `jest.fn()` that only ever recorded a join
(`joinedRooms.push(date)`), which cannot fail no matter what date
`useLotRealtime` hands it — there was no "leave" event to be missing. It is
now `roomEvents`, a `useEffect` keyed on `date` that joins on mount/every date
change and leaves whatever date it is leaving behind through the effect's own
cleanup, mirroring the real `useDayRoom`
(`libs/realtime-client/src/lib/connection.tsx`). `setup()` now returns the
render result (so tests can `rerender`) alongside its existing `client` /
`invalidate` / `date`.

## Why

Task 25's brief calls this out explicitly: "changing the day changes both the
realtime room and the query key — verify with a test that it unsubscribes
from the old room." A test for that already existed —
`libs/realtime-client/src/lib/connection.spec.tsx`'s `useDayRoom › leaves the
old room when the day changes` — and it is the right place to prove the
*socket-level* mechanism: it renders `useDayRoom` for real, against an
offline-socket fixture, and asserts the literal `day:unsubscribe` emission.
Re-proving that mechanism here, against a mock, would test Jest's `useEffect`
cleanup rather than anything this repository owns.

What that test cannot show is the half that is specific to *this* screen:
that `useLotRealtime` actually forwards the current `date` into `useDayRoom`
on every rerender, and that its query-key derivation
(`useMemo(..., [api, date])`) moves together with it rather than staying
pinned to whichever day was on screen first. A regression there — say, a
`useMemo`/`useRef` that freezes the date the room or the key are computed
from — would leave the *mocked* `useDayRoom` looking identical to a correct
implementation from `connection.spec.tsx`'s point of view, because that
suite never renders `useLotRealtime` at all. The two new tests close that
gap, at the layer this task actually changed.

## Consequences

- `roomEvents` replaces `joinedRooms` throughout the file; the two tests that
  read `joinedRooms` were updated to the new shape rather than left
  duplicated.
- Any future contributor extending `useLotRealtime` to watch more than one
  day at a time will need to revisit both this suite's join/leave ordering
  assumption and `connection.spec.tsx`'s.

## Verified by

`use-lot-realtime.spec.tsx`, describe block `useLotRealtime — the room and
the query key both follow the day` (2 tests, both new).

Mutation-tested during implementation (not left in the tree):

1. Freezing the date passed to `useDayRoom` on first render
   (`useMemo(() => date, [])`) — failed `unsubscribes from the old room when
   the day changes` (received `[join(DATE)]`, no leave, no second join).
2. Dropping `date` from the query key's `useMemo` dependency array alone —
   **survived** all 15 tests, because this suite's `useApi` double
   (`useAccessTokenProvider` returning a fresh closure every render) makes
   the memoised `api` object itself unstable, which forced a recompute on
   every render regardless of the dependency array and masked the mutation.
   Freezing the *value* the memo derives from instead (via `useState(date)`
   captured once, independent of `api`'s instability) reproduced the
   intended bug and failed `patches the new day's cache entry after the day
   changes, not the old one` (expected `"res-9"`, received `undefined`).

Both mutations were reverted after confirming the failure; #2 is recorded
here because a mutation that survives is the more interesting finding of the
two, and the fix was to change the mutation, not the test — `useLotRealtime`
was never at fault.
