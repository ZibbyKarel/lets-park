# Realtime

How the browser holds a Socket.io connection to the API, what it may say over
it, and what it does with what comes back.

**Scope of this document today.** Task 21 built the **client** half
(`libs/realtime-client`); the gateway is Task 15 and does not exist yet. Every
section below is therefore about `apps/web`'s side of the socket. Where a claim
depends on the server, it says so and says which task settles it.

The vocabulary — event names, payload shapes, room naming, which direction an
event travels — is not defined here. It is defined once, as Zod schemas, in
`@lets-park/contract/realtime`, and `doc/contract.md` §Realtime describes it.
Nothing in this document introduces an event; if you need a new one, add it to
the contract first (`doc/contract.md`, "Adding a realtime event").

---

## The shape of it

```
apps/web  ──  @lets-park/realtime-client  ──  socket.io-client  ~~~  gateway (Task 15)
                        │
                        └── @lets-park/contract/realtime   (event names, payload schemas)
```

One socket per browser tab, created by `useRealtimeConnection` inside
`RealtimeProvider`, which `apps/web` renders once in its provider boundary
alongside `QueryProvider`, `AuthProvider` and `IntlProvider` (Task 23 wires this
up for real).

```tsx
'use client';

export function Providers({ children }: { children: ReactNode }) {
  const getAccessToken = useAccessTokenProvider();   // @lets-park/auth/client
  const { status } = useSession();

  return (
    <RealtimeProvider
      url={apiOriginOf(process.env.NEXT_PUBLIC_API_URL)}   // the ORIGIN, not the base URL
      getAccessToken={getAccessToken}
      enabled={status === 'authenticated'}
      onInvalidPayload={(report) => logger.warn(report, 'realtime payload rejected')}
    >
      {children}
    </RealtimeProvider>
  );
}
```

`url` is the API's **origin**, never `NEXT_PUBLIC_API_URL` itself. `io(url)`
reads a path in the URL as a **namespace**, not as a mount point, so
`http://localhost:3000/api` dials the `/api` namespace — which the gateway does
not register, and the refusal looks like an auth failure. The Socket.io mount
point is the separate `path` option (`DEFAULT_SOCKET_PATH`). `apiOriginOf` lives
in `apps/web/src/api-url.ts` alongside the other two derivations; see
`doc/decision/0101-*`.

`enabled` holds the connection closed until there is a session: connecting
before one exists just spends a handshake the gateway is going to refuse.

No feature file imports `socket.io-client`. That is enforced, not requested —
see `doc/wrappers.md`.

---

## The handshake token

The access token travels in **`socket.handshake.auth.token`**, and nowhere else.
Not the query string, not `extraHeaders`.

```ts
io(url, {
  path,
  auth: (cb) => {
    void Promise.resolve(getAccessToken()).then(
      (token) => cb(toHandshakeAuth(token)),
      () => cb({})
    );
  },
});
```

Three properties follow from `auth` being a **function** rather than an object,
and all three are load-bearing:

| property | why |
| --- | --- |
| re-read on **every** engine open | Socket.io calls `auth` from `Socket.onopen`, which is bound to the manager's `open` event for the socket's whole life. An object is read once, at construction, so a socket that outlives a token rotation would spend the rest of its life re-presenting an expired credential. |
| the CONNECT packet waits for the callback | `libs/auth`'s provider is async while a refresh is in flight. Nothing is sent until it settles. |
| no session, or a failed provider, sends `{}` | An empty handshake is refused by the gateway. Swallowing a refresh failure into a *successful* anonymous connect would be a silent downgrade. |

A query string is written verbatim into nginx's `$request_uri`, load-balancer
access logs, CDN logs and `engine.io`'s debug output, none of which redact — it
would turn a credential with a lifetime of minutes into one with the retention
period of a log bucket. `extraHeaders` would not have worked either: the browser
`WebSocket` API cannot set request headers, so Socket.io applies them to the
polling transport only, and a socket that upgraded would silently stop
presenting its credential. Full reasoning, and the tests: `doc/decision/0060-*`.

Nothing about the token is logged — not by this lib, and not on the failure
paths. `connect_error` deliberately carries nothing onward: for an auth failure
it is the gateway's rejection of the token that just travelled.

### Reconnecting

**A connection can fail in two ways, and they are not the same failure.**
`connect_error` fires for both, so the handler branches on `socket.active` —
the library's own `!!socket.subs`, which is the exact field it clears when it
gives up on a socket.

| | `socket.active` | status | who retries |
| --- | --- | --- | --- |
| the transport could not be established | `true` | `connecting` | Socket.io's own loop |
| the gateway **refused the handshake** | `false` | `rejected` | this lib, by building a new socket |

For a **transport** failure, Socket.io's reconnection settings are left at their
defaults — unlimited attempts, 1 s growing to 5 s, 0.5 jitter
(`doc/decision/0063-*`). They are exponential backoff with jitter already;
restating them would be a second place to keep in sync. The part this project
has an opinion about is *what a reconnect re-sends*, which is the `auth`
callback above.

A **refused handshake** is different, and it is the one this lib has to handle
itself. Socket.io sends a CONNECT_ERROR packet and `Socket.onpacket` calls
`destroy()` **before** emitting `connect_error`: the socket loses its manager
subscriptions and will never present a token again. Nothing retries it, so
reporting `connecting` would pin the UI on a connection that is not coming —
the grid silently stops updating, `useCellLock` never leaves `requesting`, and
only a page reload fixes it.

So a refusal is terminal for *that socket*, and the recovery is a **new** one,
which re-runs the `auth` callback and therefore presents whatever token the
provider has now — a stale token after a backgrounded tab is exactly the case
this covers. Three automatic attempts, at 1 s / 5 s / 30 s
(`REJECTED_RETRY_DELAYS_MS`), the counter resetting on any successful connect.
After that the status stays `rejected` until somebody asks again:

```tsx
const { status, reconnect } = useRealtime();
// status === 'rejected' → offer the user a control that calls reconnect()
```

The cap is deliberate where the transport's is not. A refusal is the gateway
*answering*, and re-presenting a credential it has just rejected — a revoked
account, a session signed out elsewhere — is a request that cannot succeed.
`doc/decision/0061-*` has the full reasoning.

`RealtimeStatus` is therefore `connecting | connected | disconnected |
rejected`. `connecting` still covers both the first attempt and every transport
retry: a UI distinguishing "still connecting" from "retrying after a dropped
transport" would be showing the user a difference they cannot act on. `rejected`
is the one they can.

---

## Rooms: one per day

```tsx
useDayRoom(date);   // or useDayRoom(null) while there is no day to watch
```

Emits `day:subscribe` once the connection is up, and `day:unsubscribe` when the
day changes or the component goes away. **Rejoining after a reconnect is not
extra logic** — the effect depends on `status`, so a new connection re-runs it.
That matters: a dropped socket loses its server-side room membership, and a
client that did not re-subscribe would go quietly deaf.

The subscribe is gated on `connected` rather than emitted eagerly. Socket.io
would happily buffer an emit made while disconnected and flush it on the next
connection, which looks identical until the buffer was cleared by the
disconnect — at which point the client is deaf and nothing said so. For the same
reason, `day:unsubscribe` is only sent while the socket is still up: once it is
down the room is gone anyway, and a buffered unsubscribe delivered on the *next*
connection means something else entirely.

---

## Everything inbound is parsed

`ServerToClientEvents` is a compile-time map. At runtime, `socket.on('cell:locked',
handler)` hands `handler` whatever bytes arrived, cast. A server one deploy
ahead, a mangled frame, or simply a bug produces a value TypeScript swears is a
`CellLockedEvent` and is not.

So `useRealtimeEvent` parses first:

```tsx
useRealtimeEvent('reservation:created', (payload) => {
  // payload has been through reservationCreatedEventSchema
});
```

- The schema comes from `SERVER_TO_CLIENT_EVENT_SCHEMAS` **by lookup**, not from
  a `switch`. An event added to the contract is validated here the moment it is
  added; there is no second list to forget.
- A payload that fails is **dropped, not thrown** — one malformed broadcast must
  not take down a page that is otherwise working — and reported through
  `onInvalidPayload`.
- The handler receives the **parsed** value, so keys the contract does not
  declare are gone rather than forwarded.
- `InvalidRealtimePayload` is `{ event, issues }` where `issues` is Zod's
  path/message list and nothing else. Deliberately not the payload: these
  payloads name users, and a report that is safe to hand straight to a logger is
  worth more than a verbose one that is not.

This is the mirror of the rule the gateway implements in the other direction —
Task 15 validates every inbound command against
`CLIENT_TO_SERVER_EVENT_SCHEMAS` and drops what fails
(`libs/contract/src/realtime/commands.ts`).

Acknowledgements are inbound data too, and are parsed the same way
(`parseAck`). An unparsed `cell:lock` ack is a `setTimeout(NaN)` waiting to
happen.

---

## The cell lock

A **hold, not a reservation.** Acquiring it books nothing; the reservation is
still created over the API, which re-checks everything. A client that skips the
lock gets a `CONFLICT` from `reservation.create` instead of a nicer message. What
the hold buys is the "právě upravuje …" state on everybody else's tile while one
user has a form open.

```tsx
const { status, expiresAt, lockedBy } = useCellLock({
  date,
  parkingSpotId,
  enabled: isFormOpen,
});
```

| `status` | meaning |
| --- | --- |
| `idle` | not asked for — disabled, or no connection |
| `requesting` | asked, no answer yet |
| `held` | this client holds it and is renewing it |
| `held-by-other` | somebody else has it; `lockedBy` says who, `expiresAt` says until when |

Three things have to be true for the "právě upravuje" state not to get stuck,
and the hook makes all three automatic by putting the whole lifecycle in **one
effect** — so every way of leaving a cell is the same cleanup and every way of
arriving at one is the same setup.

### 1. The hold is renewed

There is **no separate heartbeat command.** Re-sending `cell:lock` for a cell
you already hold extends its TTL (`libs/contract/src/realtime/commands.ts`) —
one command fewer on the inbound surface, and an idempotent one, so a client
that loses track of its own state cannot corrupt the server's.

The renewal is scheduled from the server's `expiresAt`, at
`CELL_LOCK_RENEW_FRACTION` (0.5) of the remaining time, floored at
`MIN_CELL_LOCK_RENEW_DELAY_MS` (1 s):

- **from `expiresAt`, not from a TTL constant copied onto the client** — the
  client is then correct for whatever TTL the gateway is configured with, and
  there is no second number for two tasks to keep in sync;
- **half**, so a renewal lost in flight still leaves a second attempt inside the
  same TTL — see below for what makes that second attempt exist;
- **the floor** turns clock skew or an already-past `expiresAt` into one request
  per second instead of a busy loop. `Date.parse('soon')` is `NaN`, and
  `setTimeout(NaN)` fires immediately, forever.

Renewing does not drop the component out of `held` and back to `requesting`:
the hold was never lost.

**The renewal is sent with an acknowledgement timeout, and that is load-bearing.**
`socket.emit(event, payload, cb)` has no timeout in Socket.io: a callback whose
ack never arrives is simply never called. Since the next renewal is scheduled
from *inside* that callback, one dropped ack would end the heartbeat for good —
silently, with the form still showing `held` while the server's TTL lapsed and
somebody else took the cell. So `cell:lock` goes out through
`socket.timeout(CELL_LOCK_ACK_TIMEOUT_MS)`, which calls the callback with an
error instead of never calling it:

- one retry (`CELL_LOCK_ACK_ATTEMPTS` = 2 sends), which is the "second attempt
  inside the same TTL" the half-fraction leaves room for — 5 s + 5 s resolves by
  ~25 s of a 30 s TTL;
- a second loss drops the hook to **`idle`**, not a frozen `held`. A UI
  asserting a hold the server has stopped confirming is the defect, not the
  mitigation;
- any acknowledgement resets the budget.

`doc/decision/0062-*`.

### 2. The hold is given back

`cell:unlock` on unmount, on `enabled` going false, and on the cell changing.
All three are the same effect cleanup, so there is no path that closes a form
without releasing.

**One measured exception, which is React's rather than the hook's.** When the
*whole provider tree* is deleted at once, React runs a deletion's cleanups
parent-first, so `useRealtimeConnection` has already disconnected the socket by
the time `useCellLock`'s cleanup runs, and there is nothing left to say
`cell:unlock` on. That is not a leak: a dropped socket is exactly how the
gateway learns to free a hold, and it is the same path a closed tab takes. It
does mean the emit is *guaranteed* for the case that matters — a form closing on
a live page — and *redundant* for the case it is not.

A hold this client never acquired is never released: a `HELD_BY_OTHER` answer
leaves nothing to give back, and emitting `cell:unlock` for it would ask the
server to drop somebody else's lock.

### 3. The hold is re-taken after a reconnect

A dropped socket drops the server's lock with it, so the hook re-requests on the
new connection rather than believing the state it had. No `cell:unlock` is sent
across the gap — the socket was already gone.

### What the hook deliberately does not do

**It does not poll a contended cell.** `held-by-other` sits still; the
`cell:unlocked` broadcast (and `expiresAt` running out) is how a client learns
the cell is free again. Polling from every open tab is exactly the traffic the
broadcast exists to avoid.

---

## What is tested, and what is not

Tests live beside the code: `socket.spec.ts`, `connection.spec.tsx`,
`cell-lock.spec.tsx`, `validation.spec.ts` (69 tests).

The socket in those tests is a **real** `socket.io-client` socket. Only the
transport is replaced — `manager.open()` becomes a no-op and `manager._packet()`
captures what would have gone on the wire — while `Socket.onopen`,
`Socket.onpacket`, `Socket.onclose`, `emit`'s buffering and the acknowledgement
registry are the library's own code, driven through the manager's real
`open` / `close` / `packet` events. A reconnect in those tests is the same event
the reconnect timer fires in production. Even socket.io-parser's numeric packet
type codes are *discovered* from the installed client rather than written down —
including CONNECT_ERROR, which the client never sends and which is therefore
identified by the pair of effects only it has (it emits `connect_error` **and**
leaves the socket inactive).

`src/__fixtures__/offline-transport.ts` explains why in more detail. The short
version: a double may stand in for a dependency's behaviour, never for the shape
of its protocol.

**Not verified here, and by what it would be:**

| claim | settled by |
| --- | --- |
| the gateway reads the token from `handshake.auth.token` | Task 15 |
| a real refused handshake arrives as CONNECT_ERROR and not as a plain disconnect | Task 15 |
| three attempts over ~36 s is long enough for `libs/auth` to rotate a token | Task 15 + e2e |
| a real reconnect against a real server re-authenticates | Fáze 7 e2e |
| the server's lock TTL and this client's renewal actually interleave | Task 15 + e2e |
| broadcasts arrive only in the day room a client joined | Task 15 |

---

## Single instance, and what changes when that stops being true

The MVP targets one API instance, so Socket.io needs no adapter and no Redis
(global constraint 8). The upgrade path is a Socket.io adapter on the server
side; **nothing in `libs/realtime-client` changes when it lands** — rooms,
event names and payloads are the contract's, and the client already assumes it
may be talking to a server that has been redeployed under it, which is why every
inbound payload is parsed.

---

## Related

- `doc/contract.md` §Realtime — the events themselves, and how to add one
- `doc/wrappers.md` §`libs/realtime-client` — the wrapper ban and its probes
- `doc/decision/0022-*` — event naming, one transaction → one event
- `doc/decision/0023-*` — realtime is a separate entry point; the maps are derived
- `doc/decision/0047-*` — the access token crosses to the browser; the refresh token does not
- `doc/decision/0060-*` — the websocket token is a handshake callback, not a query string
- `doc/decision/0061-*` — a refused handshake is a terminal status, recovered by a new socket
- `doc/decision/0062-*` — the cell-lock heartbeat uses Socket.io's ack timeout
- `doc/decision/0063-*` — transport reconnection stays unlimited; only refusals have a ceiling
