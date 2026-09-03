# 0187 – The browser e2e suite runs against the built app, not `next dev`

## What

`apps/web-e2e/playwright.config.mts` starts the web app with

```
npx nx run web:start -- --port 4200
```

instead of `npx nx run web:dev`. `start` already declares `dependsOn: ['build']`,
so a run builds the app (Nx-cached; ~6 s cold, instant warm) and serves the
output with `next start`. Same port, same environment, same API.

## Why

**Because `next dev` is not the application, and the difference cost this suite
a 25% flake.**

`cell-lock.spec.ts` failed 5 runs in 20, in isolation, on an otherwise idle
machine. The symptom was always the same and always misleading: the observing
user's tile read `Volné` when it should have read *"právě upravuje Dev User"*,
as though the broadcast had never arrived.

It had arrived. Tracing every socket.io packet on both pages
(`E2E_TRACE_REALTIME=1`, `apps/web-e2e/src/support/realtime.ts`) produced this,
twice, on two independent failures:

```
67486 user      OUT 420["cell:lock",   {"date":"2026-10-05","parkingSpotId":"01a0…"}]
67486 user-two  IN   42["cell:locked", {…}]
67486 user      IN   42["cell:locked", {…}]      ← the holder hears its own lock
67517 user      OUT 420["cell:lock",   {…}]      ← and takes it a second time
67519 user-two  IN   42["cell:locked", {…}] ×2
67533 user      OUT  42["cell:unlock", {…}]      ← while the dialog is still open
67533 user-two  IN   42["cell:unlocked",{…}] ×2
```

Three facts, in order:

1. **The holder receives its own `cell:locked`.** The gateway sends that
   broadcast to the day room *excluding the asking socket*
   (`realtime.gateway.ts`, `emitToDay('cell:locked', payload, except)`). A page
   can only hear its own lock if it has a **second socket**.
2. It has. Logging every `WebSocket` the page opens shows two distinct
   socket.io connections per tab — two `sid`s, fifteen milliseconds apart —
   alongside the two `_next/webpack-hmr` sockets. Every `day:subscribe` is
   emitted twice for the same reason. This is React `StrictMode` mounting the
   tree twice, which is what it is *for*, and which `next dev` turns on.
3. Two connections means two `useCellLock` effects taking the same hold. When
   one of them tears down, its cleanup emits `cell:unlock` — and
   `LockService.release` honours it, because a hold is keyed by **user**, not by
   socket (deliberately, `lock.service.ts`: it is what makes a reconnect a
   renewal rather than a self-conflict). So the dying instance drops the living
   one's hold, every observer's tile goes back to `Volné`, and the dialog is
   still open.

Whether the run failed came down to whether the surviving `cell:lock` landed
before or after the dying instance's `cell:unlock` — a race between two effect
instances, decided by the event loop.

**`StrictMode`'s double invoke is development-only**, so a built app mounts each
effect once and — almost always — opens one socket. Testing the bundle that
ships is therefore both the larger part of the fix and the more honest thing to
do: the brief for this suite says it should run the same application code
production runs, and `next dev` was the one place in this repository where that
was not true.

Measured, on the same machine, `cell-lock.spec.ts` alone:

| server | runs | failures |
| --- | --- | --- |
| `web:dev` | 20 | **5** |
| `web:start` | 26 | **1** |

and the whole suite is faster with it — 18 passed in 6.6 s against `next start`
versus 13–16 s against `next dev`, because nothing is compiled on demand.

### The residual, stated plainly

**One run in twenty-six still failed, and the packet trace shows the same
shape**: the page opened *two* socket.io connections six milliseconds apart, and
from there the story is identical — two holds, one teardown, `Volné`. So
`StrictMode` is not the only way this app ends up with two connections; it is
only the way that happens on *every* mount.

That remaining duplicate connection is an **application defect**, not a test
one, and it is left as a finding rather than fixed here: chasing it means
changing `libs/realtime-client`'s connection lifetime, which is a different
task's worth of care. What the suite does in the meantime is tell the truth
about it — the assertion is correct, the app really does show a bay as free
while somebody has its dialog open, and the failure names the tile that stayed
grey. Adding a retry would have hidden a real bug; `retries` stays `0`.

`E2E_TRACE_REALTIME=1` reproduces the whole diagnosis in one command, which is
why that switch is kept.

### Why not fix the application instead

Two candidate fixes, both worse than they look:

- **Key `release` by socket.** That is exactly what `lock.service.ts` argues
  against at length: a client that reconnects re-requests its hold on a *new*
  socket, and socket-keyed ownership would answer that with `HELD_BY_OTHER` —
  the user told they are editing against themselves. The current design is the
  considered one.
- **Make `useCellLock` idempotent across instances.** There is no shared place
  for two React trees to coordinate; they are, by construction, two
  applications.

There is a real (narrow) product consequence of user-keyed release, and it is
worth naming rather than fixing here: **two tabs, same user, same cell — closing
the dialog in one releases the hold the other still shows as held**, until that
tab's next renewal (up to half the TTL, ~15 s). That is exactly what the two
duplicate connections do to themselves. A courtesy lock briefly lying is within
what `lock.service.ts` already documents as its remit, and the API re-checks
everything on `reservation.create` regardless. It is recorded in the task report
as a finding, not smuggled into a test change.

### Why not just disable `StrictMode`

It would fix the flake by removing the check that found a real bug, for every
developer, in every feature. `StrictMode` did its job here.

## How

- `apps/web-e2e/playwright.config.mts` — the second `webServer` entry.
- `apps/web/project.json` needs no change: the `start` target inferred by
  `@nx/next` already depends on `build`; `--port 4200` is passed on the command
  line for the same reason `dev` pins it — the workspace `.env` carries
  `PORT=3000`, which belongs to the API.
- `apps/web-e2e/src/support/realtime.ts` — the tracing that found this, kept and
  documented, behind `E2E_TRACE_REALTIME=1`.

## Risk

- **A reused dev server brings the flake back.** `reuseExistingServer` is on
  outside CI, so a developer with `nx run web:dev` already up gets exactly the
  behaviour described above — Playwright does not reconfigure a process it did
  not start. `doc/testing.md` names the symptom and the fix (stop the dev
  server, or set `CI=1`). This is the same residual as
  `doc/decision/0186-*`'s throttle limits, and it is not silently handled
  because it cannot be.
- **The suite no longer exercises `next dev`.** It never meaningfully did:
  nothing here asserts on Fast Refresh or on development-only behaviour. What is
  lost is the chance of noticing a `next dev`-only regression from the e2e
  suite, which is not what an e2e suite is for.
- **A run now depends on a build succeeding.** `nx run web-e2e:e2e` already
  depended on `api:build`, so this adds a second cached build to the same
  chain — measured at ~6 s cold and nothing warm.
