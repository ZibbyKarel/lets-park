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
2. **The servers.** These come from two different places, which matters more
   than it sounds:
   - **The API is started by Nx**, not by Playwright. `@nx/playwright` reads the
     `webServer` command naming `api:serve` and turns it into a real task
     dependency, so Nx runs it first and Playwright adopts the result. Nothing
     set in `playwright.config.mts` reaches that process — see the throttle
     entry under "When it goes wrong".
   - **The web app is started by Playwright**, as `nx run web:start -- --port
     4200`: the **built** app, not `next dev`. `next dev` runs React
     `StrictMode`, which mounts every effect twice and gives each page a second
     socket.io connection; the built app does that far less
     (`doc/decision/0187-*`). The build is Nx-cached and adds about six seconds
     cold.

   Both are adopted rather than restarted if the port is already answering.
3. **The `setup` project** signs all three personas in through the real OIDC
   redirect and caches the sessions in `apps/web-e2e/.auth/` — git-ignored, and
   rewritten on every run (`doc/decision/0185-*`).

Only Chromium runs (`doc/decision/0182-*`), and `retries` is `0` on purpose: a
scenario that only passes on the second attempt is a bug report, not a nuisance.

`fullyParallel` is on (from `nxE2EPreset`), so **the tests inside one file run
concurrently in separate workers**. That is easy to forget and it has bitten
this suite once already: two tests in `cell-lock.spec.ts` shared a bay, and
because a cell lock is keyed by user, each was releasing the other's hold. A
test that mutates shared state needs its own bay — see `SPOTS` in that file, and
`SPEC_DAY_SLOTS` in `support/dates.ts` for the same discipline between files.

To see what the sockets are actually doing, set `E2E_TRACE_REALTIME=1`. Every
`day:*` and `cell:*` packet each page sends or receives is printed with a short
clock and a label identifying the **page** — `w3/user#1`, worker and ordinal —
along with every WebSocket that page opens. Labelling by persona alone is what
made two concurrent pages read as one page with two sockets, so the ordinal is
load-bearing. Nothing else is printed, deliberately: the socket.io handshake
carries the access token and matches neither name.

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

### Before anything else: kill 3000 and 4200

```bash
lsof -ti tcp:3000 tcp:4200 | xargs kill -9
```

`reuseExistingServer` is `true` outside CI, so Playwright **adopts** whatever is
already listening instead of starting its own. That is a convenience most of the
time and a trap exactly once: a `next start` left over from an earlier run is
serving the **previous build**, so a change you just made to application source
is not in the app the browsers are driving.

This is not hypothetical. During review of this suite, a falsification —
`OKTA_SCOPES` with `email` removed — came back **green with the mutation in
place**, because a stale server was serving an unmutated bundle. Killing both
ports made the same mutation go red immediately.

So: **kill both ports before any falsification run, and before believing any
result that surprises you.** Nothing in the output tells you this happened.

The same applies to the API, for a different reason — see the throttle entry
below: Nx starts it, not Playwright, so an API left running keeps whatever
environment it was started with.

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
default throttle is 300 per rolling minute — so runs stacked back to back can
trip it, and the lot screen renders a throttled day query as its error state.

**The suite cannot raise those limits for you, and does not pretend to.** `nx
show project web-e2e --json` shows `dependsOn: [{projects: ['api'], target:
'serve'}]` — inferred by `@nx/playwright` from the `webServer` command in
`playwright.config.mts`. So **Nx** starts the API, with Nx's environment, and
Playwright adopts it; an `env` block in the Playwright config never reaches it.
Verified against a running suite: `X-RateLimit-Limit: 300`, strict `20` — the
shipped defaults. (`doc/decision/0186-*` records the measurement and why the
inert `env` block was removed rather than left looking effective.)

The remedy is to start the API yourself, before the suite, with limits that suit
a machine driving browsers — Playwright will adopt that one:

```bash
lsof -ti tcp:3000 | xargs kill -9
THROTTLE_LIMIT=10000 THROTTLE_STRICT_LIMIT=1000 npx nx run api:serve
```

Or simply wait a minute between runs; a single run fits inside 300.

**`cell-lock.spec.ts` fails, saying a tile still reads `Volné`.** Something
released the hold while the dialog was still open. `LockService.release` keys a
hold by **user**, not by socket, so *anything* holding the same cell as the same
user can drop it.

In order of likelihood:

- **A new test in that file shares a bay with an existing one.** `fullyParallel:
  true` runs the tests of one file in separate workers at the same time, so one
  test's `closeDialog` releases the other's hold. This is what the `SPOTS` map
  at the top of the spec exists to prevent — one bay per test. Measured during
  review, before the split: 4 failures in 14 runs at default parallelism, 0 in 8
  at `--workers=1`, 0 in 10 with distinct bays. **It does not reproduce on
  demand**, though: putting both tests back on one bay and running it again gave
  22 green runs in a row. The window is small; a green run proves nothing about
  sharing a bay.
- **You are running against a dev server.** `StrictMode` gives every page a
  second socket.io connection, which sits in the same day room. Measured at 5
  failures in 20 runs against `web:dev`. Kill 4200 and let the suite start
  `web:start` itself.
- **The known application defect.** About one page in three opens a second
  socket.io connection even against the built app — 23 of 68 pages across four
  runs — for reasons that are not yet understood and are *not* `StrictMode`.
  All four of those runs passed, so this is not usually what reddens the spec,
  but it is real. `doc/decision/0187-*` has the traces.

Reproduce any of them with `E2E_TRACE_REALTIME=1` and count `OPEN` lines per
page label — the labels are `w<worker>/<persona>#<n>`, so two lines with the
*same* label are one page with two sockets, and two lines differing only in the
ordinal are two different pages.

There is no retry configured, and there should not be: this failure is a bug
report.

**`login.spec.ts:76` fails on the *second* `toHaveURL`, with
`Received string: "http://localhost:4200/"`.** This one is expected, in the
sense that it is understood: **sign-out is not reliably durable, and the spec is
reporting it.** Measured at 3 failures in 35 full-suite runs, 0 in 12 runs of
the spec alone — it needs the load of the rest of the suite. In the retained
trace, `POST /api/auth/signout` clears the cookie, `GET /prihlaseni` renders the
login screen with no session, and then `GET /` comes back **200 with a freshly
issued `authjs.session-token`** and the lot renders signed in. No `/authorize`
request follows the sign-out, so nothing re-authenticated — the session that
comes back is the same one.

**How it comes back is not yet known**, and the record is careful about that:
the trace captured response headers only, so the request `Cookie` header on that
`GET /` — the datum that would settle it — is missing. Re-issuing the cookie is
the ordinary behaviour of a request that *arrived* with a valid one under
`strategy: 'jwt'`. The leading hypothesis is a concurrent `GET
/api/auth/session` (which next-auth's own `signOut` triggers, and which re-issues
the cookie) racing the sign-out and re-installing it — which also explains the
load dependence. `doc/decision/0189-*` has the full trace, the severity
assessment, and why the assertion is kept rather than retried or relaxed.

If you need to reproduce it: run the whole suite in a loop with
`--trace retain-on-failure` and read `0-trace.network` out of the retained
`trace.zip`. Running the spec on its own will not do it.

Do not mistake a *different* failure for this one. It is always
`login.spec.ts:76`, always the second `toHaveURL`, always that received value.

**A spec times out on the first visit to a route.** Same cause as above, seen
from a different angle: `next dev` compiles a route on demand — `/nastaveni` has
been measured at 4.9 s, past Playwright's 5 s default. `openSettings()` in
`src/support/lot-page.ts` carries a 30 s allowance for exactly this
(`doc/decision/0183-*`); a new spec visiting a new route against a reused dev
server should use the same constant rather than inventing a number.

**`auth.setup.ts` times out on `sign in as <persona>`.** Seen once during review
of this suite, and **not reproduced since: 0 failures in 105 sign-ins** (35
full-suite runs × 3 personas). So there is no diagnosis here, only the shape of
the thing: the `setup` project signs all three personas in *concurrently*
against a single `mock-oauth2-server` container, and the whole sign-in — two
redirects, a form, a code exchange and a first render of the lot — has to fit
inside Playwright's 30 s test timeout. If it comes back, that concurrency and
that budget are where to look first; `--workers=1` on the `setup` project alone
would tell you which.

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
