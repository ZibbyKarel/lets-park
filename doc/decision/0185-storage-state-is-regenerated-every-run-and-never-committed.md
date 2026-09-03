# 0185 – `storageState` is regenerated every run and never committed

## What

The `setup` project signs all three personas in through the real OIDC flow at
the start of **every** invocation of the suite, and writes
`apps/web-e2e/.auth/storage-state-<persona>.json`. That directory is
git-ignored. Nothing reads a state file that a previous run left behind, and no
state file is ever assembled by hand.

`login.spec.ts` opts out entirely (`test.use({ storageState: { cookies: [],
origins: [] } })`) — it is the spec about the flow that creates a session, so it
has to start without one.

## Why

- **The files contain live credentials.** Each holds the Auth.js session cookie
  — which carries the access token and the refresh token in its encrypted JWE —
  and the mock issuer's own session cookie. Committing one would put a working
  credential in git history, and against a real tenant it would be a real
  person's.
- **A cached session goes stale, and the failure is misdirected.** An access
  token from yesterday's run is expired; the suite would open on a refresh
  attempt, and if anything about that refresh is off the first red test is
  whichever spec happened to run first — a report that points at reservations
  when the problem is authentication. Signing in afresh costs about a second per
  persona and makes "can we sign in?" the *first* question the suite answers.
- **It is the only way the suite proves anything about sign-in at all.** If the
  state were a fixture, the OIDC flow would be exercised by exactly one spec.
  As it is, every run walks it three times before anything else happens.

## How

- `apps/web-e2e/src/support/auth.setup.ts` — one `setup()` per persona, each in
  its own browser context, each calling `signInThroughOidc` and then
  `context.storageState({ path })`.
- `apps/web-e2e/src/support/personas.ts` — `storageStatePath()`.
- `apps/web-e2e/playwright.config.mts` — the `chromium` project declares
  `dependencies: ['setup']`.
- `apps/web-e2e/src/support/fixtures.ts` — `adminPage` / `userPage` /
  `userTwoPage`, each a fresh context built from its persona's file, so the
  multi-user scenarios get genuinely separate cookie jars and sockets.
- `.gitignore` — `apps/web-e2e/.auth/`. The repository's pre-existing
  `storage-state*.json` rule covers the filenames too; both are kept, because a
  credential leaking into git is not a place to rely on one rule.

## Risk

- **Three extra sign-ins per run.** About a second each, and they are the
  suite's smoke test for authentication.
- **`.auth/` survives on disk between runs.** It is git-ignored and overwritten
  every run, but it is a live credential sitting in a working tree. That is the
  same exposure as the developer's own browser session against the dev stack,
  and against `mock-oauth2-server` the credential is worth nothing.
