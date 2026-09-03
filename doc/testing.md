# Testing

Four test layers, three runners, one of them needing Docker. This page says
what each layer is for, how to run it, and what has to be up first.

---

## The layers

| Layer | Where | Runner | Needs Docker |
| --- | --- | --- | --- |
| **Unit** | `**/*.spec.ts(x)` in every project except the two `*-e2e` apps | Jest, via `nx run <project>:test` | no |
| **Database** | `apps/api/**/*.db.spec.ts` | Jest, via `nx run api:test-db` | **yes** (PostgreSQL) |
| **API end-to-end** | `apps/api-e2e/src/**/*.spec.ts` | Jest + axios, via `nx run api-e2e:e2e` | **yes** (PostgreSQL) |
| **Browser end-to-end** | `apps/web-e2e/src/**/*.spec.ts` | Playwright, via `nx run web-e2e:e2e` | **yes** (PostgreSQL + the OIDC issuer) |

They are cumulative, not redundant. A rule of thumb for where a new test
belongs:

- **Unit** — a decision, a mapping, a rendering. No process, no socket, no
  database. This is where most of the suite lives and where it should stay.
- **Database** (`*.db.spec.ts`) — anything whose correctness *is* the database:
  a unique constraint, `SELECT … FOR UPDATE`, a transaction's rollback, two
  concurrent writers racing. These are excluded from `api:test` by
  `apps/api/jest.config.cts` and run under their own config, `--runInBand`.
- **API end-to-end** — what the API does over real HTTP to a request a browser
  would never send: no `Authorization` header, a token from another issuer, a
  scheme that is not `Bearer`. `apps/web-e2e` always arrives holding a valid
  session, so it structurally cannot ask these questions.
- **Browser end-to-end** — a whole user journey across both apps, the database
  and the socket. Expensive; reserved for the six journeys in
  `apps/web-e2e/src/`.

---

## What has to be running

```bash
docker compose --profile dev up -d
```

starts three containers (`docker-compose.yml`):

- **PostgreSQL 17** on `5432` — every layer below "unit" needs it,
- **`mock-oauth2-server`** on `8080` — the OIDC issuer the browser suite signs
  in against,
- **adminer** on `8081` — a database UI, convenience only.

Then, once:

```bash
cp .env.example .env            # if you have not already
cp .env.example apps/web/.env   # Next.js reads its own directory
npx prisma migrate deploy
npx prisma db seed
```

`.env` is git-ignored and **does not travel with a git worktree**. If you are
working in one, copy it across — a missing `DATABASE_URL` is the usual cause of
a mysterious `P1000`.

Ports, because they are not free choices:

| Port | What |
| --- | --- |
| `3000` | the API (`PORT` in `.env`; Nx injects it into every target) |
| `4200` | the web app — `apps/web/project.json` pins `next dev --port 4200`, because `CORS_ALLOWED_ORIGINS` and the OIDC redirect URI both name it |
| `5432` | PostgreSQL |
| `8080` | `mock-oauth2-server` |

The API's probes are at **`/health/live`** and **`/health/ready`** — *not*
under `/api`; `configure-app.ts` excludes them from `setGlobalPrefix`. The oRPC
transport is at **`/api/rpc/…`**, not `/api/…`.

---

## Running each layer

### Unit tests

```bash
npx nx run-many -t test              # everything
npx nx run web:test                  # one project
npx nx run web:test -- lot-view      # one file, by name pattern
npx nx run web:test -- --coverage    # with coverage
```

No Docker. This is what `nx run-many -t lint,typecheck,test,build` runs, and
what CI gates on.

### Database tests

```bash
npx nx run api:test-db
```

Needs PostgreSQL up and `DATABASE_URL` set. They run against the **real dev
database**, `--runInBand`, and clean up after themselves.

`prisma migrate reset` is not part of any of this and should not be reached for:
if the schema is behind, `npx prisma migrate deploy` is the command.

### API end-to-end

```bash
npx nx run api-e2e:e2e
```

Starts its own API (`dependsOn: ["api:build", "api:serve"]`), waits for the
port, runs the specs, and then **kills whatever is listening on port 3000** —
its `globalTeardown` calls `killPort`. Two consequences worth knowing:

- If you already have `nx run api:serve` up, this target will take it down with
  it when it finishes. Expect to restart your dev API afterwards.
- If an `api:serve` from another Nx invocation is already holding the target
  lock, this run will sit at *"Waiting for api:serve:development in another nx
  process"* and eventually fail in `globalSetup` with `[AggregateError]` from
  `waitForPortOpen`. Stop the other one first — and note that killing the
  *process* is not always enough: a serve whose Nx wrapper died untidily leaves
  the lock behind, and `npx nx reset` is what clears it.

To run the specs against an API you are already serving, skip the target and
run Jest directly from the project directory — same caveat about the teardown:

```bash
cd apps/api-e2e && npx jest --runInBand
```

### Browser end-to-end

```bash
npx nx run web-e2e:e2e                              # the whole suite
npx nx run web-e2e:e2e -- src/cell-lock.spec.ts     # one spec
npx nx run web-e2e:e2e -- --headed --debug          # watch it happen
```

Everything it needs, it arranges:

1. **`globalSetup`** runs `prisma db seed` and then
   `libs/database/src/scripts/reset-e2e.ts`, as subprocesses — the module
   boundary keeps `scope:web` out of `libs/database` (`doc/decision/0184-*`).
   The reset clears next month's reservations and queue entries and sets the
   reservation window to `AUTO` at 31 days, so that the month the suite books
   into is genuinely open (`doc/decision/0181-*`). **It leaves that setting
   behind**; `npx prisma db seed` puts it back to 7 days.
2. **`webServer`** starts `nx run api:serve` and `nx run web:start` if they are
   not already up, waiting on `/health/ready` (which also proves PostgreSQL is
   reachable) and on the web app's own `/api/health`.

   `web:start`, not `web:dev`: the suite drives the **built** app.
   `next dev` runs React `StrictMode`, which mounts every effect twice and gives
   each page two socket.io connections — enough to make one tab's cell lock
   release the other's, and `cell-lock.spec.ts` fail one run in four
   (`doc/decision/0187-*`). The build is Nx-cached and adds about six seconds
   cold.
3. **The `setup` project** signs all three personas in through the real OIDC
   redirect and caches the sessions in `apps/web-e2e/.auth/` — git-ignored, and
   rewritten on every run (`doc/decision/0185-*`).

Only Chromium runs (`doc/decision/0182-*`), and `retries` is `0` on purpose: a
scenario that only passes on the second attempt is a bug report, not a nuisance.

To see what the sockets are actually doing — which is how the `StrictMode`
finding above was made — set `E2E_TRACE_REALTIME=1`. Every `day:*` and `cell:*`
packet each page sends or receives is printed with a short clock and the
persona's name, along with every WebSocket a page opens. Nothing else is
printed, deliberately: the socket.io handshake carries the access token and
matches neither name.

---

## The six journeys

| Spec | What it proves |
| --- | --- |
| `login.spec.ts` | An unauthenticated visitor is bounced to `/prihlaseni`; the button starts a real authorization-code flow (PKCE, `state`, `scope=…email…`) at the issuer; the session that comes back is one the **API** accepts; signing out re-protects the lot. |
| `identity.spec.ts` | Each persona is the seeded person — name, email, and role. The role is a database column; nothing in the token grants it. |
| `reservation.spec.ts` | A user reserves a free bay and sees their name and their profile's plate on it; the reservation survives a reload; the holder cancels it and the bay is free again. |
| `waitlist-promotion.spec.ts` | Two users: one books, the other queues and is told their position, the first cancels — and the bay is handed to the queue with nobody clicking anything. |
| `cell-lock.spec.ts` | Two users on one day: one opens a bay's dialog and the other's tile hatches over as *"právě upravuje Dev User"* and stops being clickable, live over the socket; closing releases it; the holder never sees their own hold. |
| `admin-reservation.spec.ts` | An admin opens someone else's bay from the `⋯` affordance, gets the admin dialog, and cancels it — and the bay is free for its former holder too. An ordinary user gets no `⋯`. |
| `ics-feed.spec.ts` | The calendar URL is read out of the Nastavení modal, fetched by a request context that has never signed in, and contains the reservation; a wrong token is a 404 that looks like any other 404; cancelling removes the event. |

Each spec books its **own** business day of the target month
(`SPEC_DAY_SLOTS` in `src/support/dates.ts`), so specs can run in parallel
without colliding on the one-reservation-per-user-per-day rule. Add a spec, add
a slot.

---

## When it goes wrong

**Everything 401s, with `The token does not identify a provisionable user.`**
The token reaching the API has no `email` claim. The e2e login types one into
`mock-oauth2-server`'s *Optional claims JSON* field — see
`doc/decision/0180-*`. If you are signing in by hand, type
`{"email":"user@example.com","name":"Dev User"}` into that box too.

**Everything 401s, with a bare `Unauthorized` and no message.** The API has
cached a JWKS key that the issuer no longer has. `mock-oauth2-server` re-mints
its keys when its container starts, so this follows a
`docker compose restart mock-oauth2-server`. **Restart the API.**

**Several unrelated specs fail with `Skupina IT` missing, or a bay that never
shows its holder.** Look for `"statusCode":429` on `/api/rpc/overview/day` in
the API's log. The suite issues ~200 requests from one address per run, and the
default throttle is 300 per rolling minute — so a second run inside a minute
trips it, and the lot screen renders a throttled day query as its error state.
The suite starts its *own* API with room to breathe
(`doc/decision/0186-*`), but `reuseExistingServer` means a dev API you already
had up keeps the shipped limits. Either wait a minute, or restart the API as:

```bash
THROTTLE_LIMIT=10000 THROTTLE_STRICT_LIMIT=1000 npx nx run api:serve
```

**`cell-lock.spec.ts` fails, saying a tile still reads `Volné`.** The page
opened **two** socket.io connections, both took the same cell hold, and the
teardown of one released it for both — `LockService.release` keys a hold by
user, not by socket. The bay really is shown as free while somebody has its
dialog open; the test is right and the app is wrong.

Two things make it more or less likely:

- **You are running against a dev server.** `reuseExistingServer` is on outside
  CI, so an `nx run web:dev` you already had up is what the browsers get — and
  `StrictMode` mounts every effect twice there, so the duplicate connection is
  the *normal* case. Measured at 5 failures in 20 runs. Stop the dev server and
  let the suite start `web:start` itself, or run with `CI=1`.
- **Rarely, the built app does it too** — 1 run in 26. That is a known
  application defect, recorded in `doc/decision/0187-*` along with the packet
  trace that identifies it. Reproduce it with `E2E_TRACE_REALTIME=1` and look
  for two `OPEN` lines for one persona inside one test.

There is no retry configured, and there should not be: this failure is a bug
report.

**A spec times out on the first visit to a route.** Same cause as above, seen
from a different angle: `next dev` compiles a route on demand — `/nastaveni` has
been measured at 4.9 s, past Playwright's 5 s default. `openSettings()` in
`src/support/lot-page.ts` carries a 30 s allowance for exactly this
(`doc/decision/0183-*`); a new spec visiting a new route against a reused dev
server should use the same constant rather than inventing a number.

**`P1000` from anything Prisma.** `DATABASE_URL` is missing or wrong. It lives
in the git-ignored `.env` at the repo root, which does not travel with a
worktree.

**Port 3000 goes away in the middle of something.** `nx run api-e2e:e2e`'s
teardown kills it. See the API end-to-end section above.

---

## Writing a new test

- **Write it with the code it covers**, not afterwards — `plan.md`, §Working
  style.
- **Then break the thing it names and watch it go red.** A test that would
  still pass with its subject deleted reports coverage that does not exist,
  which is worse than no test at all. Every scenario in `apps/web-e2e` was
  falsified this way before it was committed; the mutation table is in the
  task report.
- **Never wait on a clock.** `page.waitForTimeout(2000)` passes on an idle
  laptop and fails on a busy one. Playwright's assertions retry; `waitForURL`
  and `toPass` exist. Two specs in this repository have already had to be
  rewritten for exactly this.
- **A flake is a bug.** Isolate it, run it twenty times, find the cause. The
  throttle finding above started as "four unrelated specs failed once". Do not
  add a retry.
- **Reach for the cheapest layer that can fail for the right reason.** A rule
  belongs in a unit test; only a journey belongs in Playwright.
