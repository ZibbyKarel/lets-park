# 0221 – There is no duplicate socket: a page is not a document

## What

`doc/decision/0187-*` recorded, as an open application defect with an unknown
cause, that "**68 pages, 23 of them duplicated — about one page in three**"
opened a second socket.io connection against the built app.

Re-measured, the number is real and the defect is not. A Playwright `Page` is
not a document: six of this suite's pages navigate or reload a second time, and
a second document opens a second socket **because that is what a page load
does**. Measured per document rather than per page:

| sockets opened by one **document** | documents |
| --- | --- |
| 1 | **89** |
| 2 or more | **0** |

89 documents across four full-suite runs, every one of them with exactly one
connection, and 25 document loads answered by exactly 25 sockets in each
complete run. Nothing in `libs/realtime-client` was changed to produce that
result — `git diff` against the base commit touches no file under
`libs/realtime-client/` or `apps/web/src/`.

So: **no fix, because there is nothing to fix.** What this task adds instead is
the instrument that can tell the two questions apart, and a test that asks the
one that matters.

## Why

**Because the original measurement counted the right events against the wrong
container, and the record then reasoned from the number instead of from the
mechanism.**

`recordDayRoomSubscriptions` attaches `page.on('websocket')`. That handler fires
for every WebSocket a `Page` ever opens, across every document it ever loads.
`0187` was careful about one confusion — it labelled each page rather than each
persona, after "two pages of one persona" had been misread as "one page with two
sockets" — and then made the same mistake one level down.

The tell was in the traces the whole time, unread. Every page that opened a
second socket restarted the application from the beginning:

```
[rt 67838 w3/user#1] OPEN  ws://localhost:3000/socket.io/…sid=ps7on87i-JKQV0cSAAAG
[rt 67853 w3/user#1] OUT   42["day:subscribe",{"date":"2026-09-03"}]   ← today
…                                                                       walks to
[rt 68054 w3/user#1] OUT   42["day:subscribe",{"date":"2026-10-06"}]   ← the target
[rt 68092 w3/user#1] OUT   420["cell:lock", …]
[rt 68216 w3/user#1] OUT   42["cell:unlock", …]
[rt 68912 w3/user#1] OPEN  ws://localhost:3000/socket.io/…sid=oDH1dB6A0VniLyw9AAAa
[rt 68937 w3/user#1] OUT   42["day:subscribe",{"date":"2026-09-03"}]   ← today, again
```

A second connection opened by a double-mounting React tree does not re-walk the
calendar from today. A fresh document does, because the day is component state
and the screen starts on today. That page is `admin-reservation.spec.ts`'s
`userPage`, and line 73 of that spec is `await userPage.reload()`.

The correspondence is exact, and it was checkable without any new tooling. The
suite's pages that load a document twice are precisely six:

| spec | page | second load |
| --- | --- | --- |
| `admin-reservation` (1st test) | `userPage` | `reload()` |
| `admin-reservation` (2nd test) | `adminPage` | `reload()` |
| `reservation` (2nd test) | `userPage` | `reload()` |
| `reservation` (3rd test) | `userPage` | `reload()` |
| `ics-feed` | `userPage` | a second `goto(LOT_PATH)` |
| `waitlist-promotion` | `userTwoPage` | `reload()` |

Baseline on this task's base commit (`a9fdb70`), full suite, `E2E_TRACE_REALTIME=1`:
**17 pages, 23 sockets, and exactly those six pages carrying two.** 17 + 6 = 23.
There was never a spare socket to explain.

### What was measured, and how

Two instruments, because counting alone would only have shown that the totals
agree — and totals agreeing is consistent with one document opening two sockets
while another opens none:

- **`LOAD` lines** in the trace, one per document (`page.on('load')`). They give
  documents and sockets per page. They deliberately do *not* claim an order:
  `load` fires when the document's load event completes, which can be after the
  socket that document's own React tree opened.
- **`installRealtimeSocketCounter`** — an init script, which Playwright runs
  once **per document**. It tags the document with an id and writes one console
  line per realtime socket the document constructs, so every socket is
  attributed from *inside* the realm that opened it. This is the instrument that
  makes the claim rather than infers it.

Per document, across four traced full-suite runs (`E2E_TRACE_REALTIME=1`, own
API on 3010 and own web server on 4210 against a dedicated database, so no other
worktree's servers could be adopted or interfere):

```
ALL RUNS sockets-per-document histogram: {1: 89}
ALL RUNS documents: 89  sockets: 89
documents with more than one socket: none
pages that opened >=2 sockets: 7 of 18   ← the "one page in three", per run
```

The seventh page is this task's own new spec, which reloads on purpose.

### Why `StrictMode` was never the story either

`0187` already retracted `StrictMode` as the cause and was right to: React's
double-invoke is development-only, and the suite serves the built bundle. The
correction stopped one step short — having removed the explanation, it kept the
phenomenon. There was no phenomenon.

### What this leaves standing

`libs/realtime-client`'s design is what makes one-per-document true rather than
lucky, and none of it was in question: `useRealtimeConnection` builds the socket
inside an effect and tears it down in that effect's cleanup, `forceNew: true`
keeps it out of socket.io's per-origin manager cache, and only `url`, `path`,
`enabled` and `generation` can rebuild it. Every consumer — `useRealtimeEvent`,
`useDayRoom`, `useCellLock` — reads the connection from context and never
creates one.

The lock hazard `0187` described is still real, and it is still worth its fix:
**two documents of one user can be live at the same moment** — two tabs, or a
reload the server has not yet noticed — and a `release` keyed by user alone lets
either of them drop the other's hold. That is `doc/decision/0220-*`. What
changes here is only the diagnosis of how a user ends up with two connections:
they open a second tab or reload the page, which is ordinary use, not a bug in
the connection's lifetime.

## How

- `apps/web-e2e/src/support/realtime.ts` — `LOAD` tracing,
  `installRealtimeSocketCounter` / `realtimeSocketsInDocument`, and a header that
  names this as the third wrong reading of that log.
  `recordDayRoomSubscriptions` is now `async`, because an init script registered
  after the first navigation would miss the document it exists to watch.
- `apps/web-e2e/src/support/fixtures.ts` — `await`s it.
- `apps/web-e2e/src/realtime-connection.spec.ts` — the regression test: one
  document, one connection, asserted after a day walk and an open editing form,
  and again on the document a reload produces.
- `apps/web-e2e/src/support/dates.ts` — a day slot of its own for that spec.

## Risk

- **A per-document counter cannot see a socket opened before the init script
  runs.** Nothing opens one that early — the connection is built in an effect,
  after hydration — but a future `<script>` in `<head>` that dialled the gateway
  would be invisible to this instrument. The `LOAD`/`OPEN` totals, which are
  collected from outside the page, are the cross-check that would still catch
  it.
- **The counter wraps `window.WebSocket` for every document of every persona
  page whenever `E2E_TRACE_REALTIME` is set.** It is a `Proxy`, so
  `instanceof`, statics and `prototype` are the originals; it is installed once
  per document (guarded), and it is off by default.
- **This record does not prove one-per-document for a browser other than
  Chromium**, which is the only one this suite runs (`doc/decision/0182-*`).
