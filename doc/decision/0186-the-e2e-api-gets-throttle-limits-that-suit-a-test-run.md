# 0186 – The e2e API gets throttle limits that suit a test run

## What

`apps/web-e2e/playwright.config.mts` starts the API with
`THROTTLE_LIMIT=10000` and `THROTTLE_STRICT_LIMIT=1000`, instead of the shipped
defaults of `300` and `20` per minute.

Two environment variables. No code path changes, no throttler is disabled, and
the `@StrictThrottle()` decorator still guards the ICS feed exactly as it does
in production — with a bigger number in front of it.

## Why

**The suite rate-limited itself, and the failure did not look like rate
limiting.** Running `nx run web-e2e:e2e` twenty times in a row against one
long-lived API produced:

```
run 1 exit=0 18 passed
run 2 exit=0 18 passed
run 3 exit=1  4 failed 13 passed
run 4 exit=1  6 failed  9 passed
```

and, in the API's log for those runs, `52 × statusCode 429` — every one of them
on `POST /api/rpc/overview/day`. What the specs reported was
`getByRole('region', { name: 'Skupina IT' })` not found, and a bay that never
showed its holder: the lot screen renders a failed day query as its error state,
so a throttled request reads as "the reservation was not created". Four
unrelated scenarios blamed themselves for one cause.

The arithmetic is not close. One run issues on the order of two hundred requests
from a single address in about twenty seconds; the default window is 300 per
sixty seconds, sliding. One run fits. Two runs inside a minute — which is what
`edit, re-run, re-run` is — do not.

**Why this is an environment value and not a workaround.** `THROTTLE_LIMIT` is a
declared, validated key in `apps/api/src/env.ts` with a documented default, and
this project's standing rule is that dev, e2e and production run the same code
and differ only in the values they are given (`doc/decision/0008-*`,
`doc/environment.md`). A browser suite driving three concurrent sessions is a
different *client*, not a different application. Choosing a number for it is the
same kind of act as pointing `AUTH_OKTA_ISSUER` at `mock-oauth2-server`.

**Why not fewer requests instead.** The volume is inherent: eighteen scenarios,
each loading a day overview per context, several of them with two or three
contexts. The only compressible part is `goToDate`'s day stepping, worth perhaps
a fifth of the traffic, and contorting the navigation helper to save requests
would trade a clear test for a slightly quieter one.

**Why not turn the throttler off.** Ten thousand a minute is generous and
finite. A runaway loop still stops; the guard is still in the chain; the
production numbers still live in one place. Nothing here tests rate limiting, so
raising the ceiling removes no coverage — but removing the guard entirely would
mean the e2e stack stopped resembling the deployed one for no gain.

## How

- `apps/web-e2e/playwright.config.mts` — `webServer[0].env`.
- Nothing in `apps/api` changes. `globalThrottlerOptions` reads
  `THROTTLE_LIMIT` from validated env as it always did, and `StrictThrottle()`
  resolves `THROTTLE_STRICT_LIMIT` per request from `process.env` with
  `ENV_DEFAULTS` as its fallback — which is why setting it on the server process
  is enough.

## Risk

- **A *reused* API keeps its own limits, and that is the common case locally.**
  `reuseExistingServer` is on outside CI, so a developer with `npm run dev`
  already up gets an API started at the defaults, and the `env` above never
  applies. Running the suite repeatedly against it will reproduce exactly the
  failure described here. `doc/testing.md` names the symptom (`429` on
  `overview/day`, specs failing with "Skupina IT" missing) and the two ways out:
  wait a minute, or restart the API with the raised limits. It is not silently
  fixed, because it cannot be — Playwright does not get to reconfigure a process
  it did not start.
- **The suite can no longer notice if the throttler broke.** It never could:
  no scenario asserts a `429`. The throttler's own coverage is in
  `apps/api`'s unit tests, where the numbers are inputs rather than ambient
  configuration.
