# Authentication and authorization

This document describes how a request from `apps/web` becomes an identified caller in
`apps/api`: where the token comes from, how it is verified against the issuer's JWKS, how a
user row appears on somebody's first ever request, and what happens when a signing key
rotates. The source of truth is the code; when they disagree, trust the code.

Everything here lives in `apps/api/src/auth/`. Env variables are documented in
`doc/environment.md`; the error shapes referenced below are in `doc/api-operations.md` and
`doc/decision/0033-*`.

---

## The one rule that shapes all of this

**Dev, e2e and production run the same code. Only env values differ.**

There is no `NODE_ENV` check, no `isTest` flag, no "skip auth locally" branch anywhere in
`apps/api/src/auth/**`. Local development points `AUTH_OKTA_ISSUER` at the
`mock-oauth2-server` container from `docker-compose.yml`; production points it at the Okta
org. The verification code cannot tell the difference and is not permitted to try.

This is why the JWKS endpoint is discovered rather than hardcoded (Okta and
`mock-oauth2-server` publish it at different paths), and why the tests stand up a real OIDC
issuer instead of stubbing the verifier.

---

## The pieces

| file | role |
| --- | --- |
| `jwks-verifier.service.ts` | OIDC discovery, the single cached `JwksClient`, `getSigningKey()`, `verifyToken()` |
| `jwt-verify-options.ts` | the one rule set both verification paths apply |
| `jwt.strategy.ts` | `passport-jwt` plumbing; delegates keys, rules and provisioning |
| `jwt-auth.guard.ts` | the global default-deny guard; honours `@Public()` |
| `public.decorator.ts` | `@Public()` — the route-level opt-out |
| `roles.guard.ts`, `roles.decorator.ts` | `@Roles('ADMIN')` |
| `current-user.decorator.ts` | `@CurrentUser()` |
| `authenticated-user.ts` | the `AuthenticatedUser` shape and its runtime check |
| `failure-log-throttle.ts` | one log line per failure kind per minute, with a suppressed count |
| `auth-user.service.ts` | just-in-time provisioning, `icsToken`, deactivated → `FORBIDDEN` |
| `token-claims.ts` | the Zod claim schema, parsed **after** verification |
| `auth.module.ts` | wiring; exports the verifier and the user service for Task 15 |

---

## The flow, end to end

### 1. Frontend → API

`apps/web` authenticates the person with Auth.js v5 against Okta and holds the resulting
access token in its session. Every call to the API carries it as
`Authorization: Bearer <jwt>`. Nothing else is accepted — not a cookie, not a query
parameter. A token in a URL ends up in access logs, `Referer` headers and browser history,
so `ExtractJwt.fromAuthHeaderAsBearerToken()` is the only extractor configured.

### 2. Guards, in order

`AppModule` registers three global guards, and the order is load-bearing:

```
ThrottlerGuard  →  JwtAuthGuard  →  RolesGuard
```

- `ThrottlerGuard` first, so rate limiting also applies to unauthenticated traffic.
- `JwtAuthGuard` next. It is an `APP_GUARD`, so **every route is authenticated by default** —
  a controller written tomorrow is protected without anybody remembering to decorate it.
- `RolesGuard` last, because it reads the `request.user` that `JwtAuthGuard` set.

Registering `RolesGuard` before `JwtAuthGuard` would make every `@Roles()` route answer 401.

### 3. Finding the key

`JwtStrategy` hands the raw token to `JwksVerifierService.getSigningKey()`, which:

1. decodes the **JOSE header only** (`jwt.decode`, no verification) to read `kid` and `alg`.
   This is the only part of an unverified token that is ever read — you cannot choose a key
   without knowing which key was claimed;
2. refuses immediately if `alg` is not `RS256`. `{"alg":"none"}` and an HMAC forgery signed
   with the public key an attacker downloaded from the JWKS endpoint both stop here, before
   any network call;
3. resolves the issuer's `jwks_uri` (see *Discovery* below) and asks the cached `JwksClient`
   for the key with that `kid`.

Every failure throws. Nothing in this file returns a fallback key or a truthy result when a
key could not be fetched.

### 4. Verifying

`jsonwebtoken.verify` checks, against the rules in `jwt-verify-options.ts`:

| rule | value | source |
| --- | --- | --- |
| signature | RS256 against the JWKS key | the issuer |
| `algorithms` | `['RS256']` — an allow-list, never the token's own claim | constant |
| `issuer` | must equal `AUTH_OKTA_ISSUER` | env |
| `audience` | must equal `AUTH_OKTA_AUDIENCE` | env |
| expiry | `ignoreExpiration: false`, no clock tolerance | constant |

**Only then** are the claims parsed, by `authTokenClaimsSchema`. Nothing downstream reads a
claim that has not been through this.

> **A trap worth knowing about.** `passport-jwt` overwrites `issuer`, `audience`,
> `algorithms` and `ignoreExpiration` from its *top-level* options — with `undefined` if they
> are absent. Passing them only as `jsonWebTokenOptions`, which looks like the tidy way to
> share one object, silently switches issuer and audience checking off with no error. The
> rules are therefore spread at the top level, and two tests
> (`refuses a token from another issuer` / `… for another audience`) exist to catch a
> regression. See `doc/decision/0042-*`.

### 5. Becoming a user

`JwtStrategy.validate()` passes the parsed claims to `AuthUserService.resolve()`. See
*Just-in-time provisioning* below. The result is an `AuthenticatedUser`, which Passport puts
on `request.user` and `@CurrentUser()` hands to a handler.

`AuthenticatedUser` is a strict subset of the row: `id`, `oktaId`, `email`, `name`, `role`,
`active`. It deliberately carries **no `icsToken`** — that is the only credential on the
personal calendar feed URL and nothing outside the ICS and settings handlers has any business
holding it.

### 6. What comes back on failure

| situation | status | body |
| --- | --- | --- |
| no header, bad signature, expired, wrong `iss`/`aud`, unknown `kid`, unreachable IdP | **401** | `{ statusCode: 401, message: … }` — Nest's transport shape, **no `code` field** |
| `User.active === false` | **403** | `{ defined: false, code: 'FORBIDDEN', status: 403, message: … }` |
| `@Roles('ADMIN')` reached by a `USER` | **403** | same as above |

The split is deliberate and is written up in `doc/decision/0041-*`. In short: an
authentication failure happens before any procedure exists, so it cannot be one of the
contract's typed errors; a deactivated user, by contrast, presented a perfectly valid token
and answering 401 would send them round the Okta login loop forever.

Stack traces are logged and never sent — that is `ContractExceptionFilter`'s job and is
unchanged by this layer. No log line in `src/auth/**` carries a raw token, a key, or an
`icsToken`, and `buildLoggerOptions` already redacts the `authorization` header.

---

## Diagnosing a 401

Every rejection above reaches the caller as the same bare 401. That is deliberate — telling
an anonymous caller *why* their token was refused is telling an attacker which half of the
forgery to fix. It does mean the response is useless for diagnosis, so **the logs carry the
diagnosis instead**.

`JwksVerifierService` classifies every key-lookup failure and logs it with an `authFailure`
field. Search for that field first:

| `authFailure` | level | what it means | what to do |
| --- | --- | --- | --- |
| `issuer-unreachable` | `error` | the discovery endpoint did not answer, or answered non-2xx | is the IdP up? is `AUTH_OKTA_ISSUER` reachable from the API host? |
| `discovery-rejected` | `error` | it answered, and we refused the document — the `issuer` it declares does not match `AUTH_OKTA_ISSUER`, or `jwks_uri` is on another origin | `AUTH_OKTA_ISSUER` is pointing at the wrong tenant, or the document is not what it should be. The `reason` field names which check failed |
| `jwks-unavailable` | `error` | discovery worked, fetching the keys did not | usually a partial IdP outage |
| `jwks-rate-limited` | `error` | more than 12 JWKS fetches in a minute | almost always a flood of tokens with unknown `kid`s; check who is calling |
| `signing-key-not-found` | `debug` | the JWKS was fetched and has no key with this `kid` | normally somebody else's token. If it is happening to *everyone*, the IdP rotated to a key it is not publishing |
| `malformed-token` | `debug` | not a JWT, or an algorithm we do not accept | normally background noise on a public endpoint |

Two other 401s do **not** come from that table, because they happen after a key was found:

- **`jsonwebtoken` rejected the token** — bad signature, expired, wrong `iss`, wrong `aud`.
  These are normal and are not logged individually; a request-id'd 401 in the access log is
  all there is. If *nobody* can log in and there is no `authFailure` line, this is where to
  look: compare `AUTH_OKTA_AUDIENCE` against the `aud` your IdP actually mints.
- **A valid token with no `email` claim, for a subject that is not yet provisioned.** Logged
  by `AuthUserService` at `error`: *"Token carries no email claim and the subject is not
  provisioned; check the IdP scopes"*. This is the first thing to check on a fresh dev
  environment.

### Why the levels are what they are

The four server-side kinds are `error`: nobody can log in and every one of them needs a
human. `discovery-rejected` in particular is a permanent misconfiguration that will never
heal on its own. Splitting the four across `warn` and `error` would mean an operator has to
know which is which before they can find any of them.

The two caller-side kinds are `debug`. A malformed bearer token and a `kid` from another
issuer are what a public endpoint receives all day; nobody acts on them, and at the default
`LOG_LEVEL=info` they cost nothing. Logging them at `warn` would also hand an anonymous
caller a cheap way to fill the log — the same reasoning `ContractExceptionFilter` already
applies to an oversized request body.

### Why an outage does not flood the log

An IdP outage sends **every** request down this path, so one line per request would be a
flood — expensive, and it buries the one line that mattered. `FailureLogThrottle` emits the
first occurrence of each kind immediately, then stays quiet for 60 seconds, counting what it
swallowed and attaching the count to the next line that gets through:

```
ERROR  Cannot verify tokens — the issuer or its JWKS is unusable
       authFailure=issuer-unreachable issuer=https://acme.okta.com/oauth2/default
       reason="OIDC discovery at … could not be reached: fetch failed"
       suppressedSinceLastLog=4126
```

So an operator sees both the cause and the blast radius. The throttle is keyed by failure
kind only — never by a `kid`, an issuer or a subject — so its map is bounded at six entries
and cannot be grown by a caller. A `kid` is reported *inside* a line, truncated to 64
characters, but never used as a key.

No `Error` object is logged, only its message. A stack adds nothing actionable here and
would be repeated every minute for the length of an outage; this follows the call
`doc/decision/0035-*` made for the readiness probe.

---

## Public routes

`@Public()` marks a route reachable without a token. It is route metadata evaluated
identically in every environment — not an environment branch. It exists for the two kinds of
route that genuinely cannot carry an `Authorization` header:

- **the health probes** (`HealthController`). An orchestrator has no bearer token and no way
  to get one; authenticating the probes would report every healthy instance as dead. The
  probes expose no data — liveness returns a constant, readiness returns up/down plus a fixed
  reason string.
- **the personal ICS feed** (Task 12). Calendar clients fetch it with no headers at all; it
  authenticates on the secret in its own URL and should also carry `@StrictThrottle()`.

A `@Public()` route gets **no** `request.user`. `RolesGuard` fails closed on that, so
`@Public()` next to `@Roles('ADMIN')` denies rather than allows, and `@CurrentUser()` throws
rather than handing a handler `undefined`.

---

## Just-in-time provisioning

There is no sign-up screen. On somebody's first ever request, `AuthUserService.resolve()`:

1. matches on `oktaId` (the token's `sub`) — the provisioning key;
2. failing that, matches on `email`, and **adopts the token's `sub` onto that row**. This
   covers a row seeded ahead of a first login and an Okta account that was deleted and
   recreated. It is logged at `warn` with the old and new `oktaId`;
3. failing that, creates the row with a fresh `icsToken` from `crypto.randomBytes(32)`,
   `base64url`-encoded.

Then `active === false` → `FORBIDDEN`.

Two further rules:

- A valid token with **no `email` claim**, for a `sub` that is not yet provisioned, is
  refused with 401 and an `error`-level log. That condition means the IdP client is missing
  the `email` scope; no placeholder address is invented.
- `email` is never refreshed from the token (it is the fallback identity key). `name` is,
  and only when it differs — so the steady-state request performs no write.

### Concurrency

A browser opens several requests at once, so "first request ever" is routinely several first
requests at once. There is no application lock — the MVP is single-instance with no Redis by
design. The database settles it: `oktaId`, `email` and `icsToken` are all `@unique`, so the
loser of the race gets `P2002`, which `AuthUserService` catches and retries (up to three
attempts), at which point the re-read finds the winner's row. Every caller gets the same row
and none of them sees an error.

Full reasoning and the risk of the email rebind: `doc/decision/0044-*`.

---

## Discovery and key rotation

### Where the keys come from

`AUTH_OKTA_ISSUER` is the only thing configured. On the first token to be verified, the
service fetches `${AUTH_OKTA_ISSUER}/.well-known/openid-configuration` and takes `jwks_uri`
from it. Okta publishes at `${issuer}/v1/keys`, `mock-oauth2-server` at `${issuer}/jwks` — a
hardcoded suffix would work in exactly one of them.

The document is checked, not just parsed:

- its own `issuer` must equal `AUTH_OKTA_ISSUER` (trailing slashes normalised), so a
  misconfigured issuer fails loudly rather than validating against another tenant's keys;
- `jwks_uri` must be on the **same origin** as the issuer, so a tampered document cannot
  point key selection at a third party.

Discovery is lazy — resolving it in the constructor would make the process refuse to boot
during an IdP blip — and memoised. **A failed discovery drops the memo**, so the next request
retries instead of every later request inheriting one rejected promise.

### What happens when a key rotates

Nothing operational. No restart, no config change, no waiting for a TTL.

`jwks-rsa` memoises signing keys **per `kid`** and does not cache failures. When the IdP
starts signing with a new key, the first token carrying the new `kid` is a cache miss, which
triggers an immediate refetch of the JWKS — and the freshly published key is there. The key
is picked up by that first request.

The 10-minute `cacheMaxAge` therefore does not govern rotation. It bounds something else: how
long a key that has been *withdrawn* from the JWKS can still be used, if it is already in the
cache.

Cache and fetch settings (constants in `jwks-verifier.service.ts`):

| setting | value | why |
| --- | --- | --- |
| `cache` | `true` | one JWKS fetch per key, not per request |
| `cacheMaxAge` | 10 min | bounds a withdrawn key's usable lifetime |
| `cacheMaxEntries` | 5 | an issuer publishes a handful of keys at most |
| `rateLimit` / `jwksRequestsPerMinute` | `true` / 12 | an unknown `kid` is a cache miss, so random `kid`s would otherwise let an anonymous caller make the API hammer the IdP |
| `timeout` | 5 s | an unreachable IdP fails the request quickly |
| `cacheMaxAgeFallback` | **unset** | see below |

### Why a cache miss can never become a bypass

`jwks-rsa` offers `cacheMaxAgeFallback`: keep serving the last known good key while the JWKS
endpoint is unreachable. It is deliberately **not enabled**. That window is precisely the
window in which a key that was just revoked — because it leaked — continues to be trusted,
and an attacker who can also make the endpoint unreachable controls how long it lasts.

So an IdP outage means requests are **rejected**, not waved through. Every failure path in
`JwksVerifierService` throws. When the rate limit is hit, `jwks-rsa` raises and the request is
refused. The cost — some logins fail during an IdP outage or a `kid` flood — is the correct
trade, and `doc/decision/0043-*` records it so nobody "fixes" it later without reading why.

---

## How this is tested

Three levels, all of which run without Docker.

**Against a real OIDC issuer.** `apps/api/src/auth/testing/oidc-test-issuer.ts` is an
in-process HTTP server that serves a genuine discovery document and a genuine JWKS of real
2048-bit RSA public keys; the tests sign real RS256 tokens against it. Nothing is stubbed —
signature checking, discovery, caching and rotation are executed, not described. It stands in
for `mock-oauth2-server` at the same two endpoints, and it publishes its JWKS at `/jwks`
specifically so that a reintroduced hardcoded Okta path would fail the suite.

**Through the assembled application.** `auth-pipeline.spec.ts` boots the **real `AppModule`**
with the same `configureApp()` that `main.ts` calls, listens on an ephemeral port and drives
it with `fetch`. That is the only way to observe the properties that matter here — that
issuer and audience are genuinely checked, that a deactivated user gets 403 and not 401, that
an undecorated route is protected, that the probes stay reachable — because all of them are
properties of a composition (Express → throttler → guard → Passport → `jsonwebtoken` →
filter) rather than of any single function.

**Mutation-checked.** Four deliberate defects were introduced and reverted, to confirm the
suite can actually fail:

| defect introduced | tests that failed |
| --- | --- |
| rules passed as `jsonWebTokenOptions` (the `passport-jwt` trap) | wrong issuer, wrong audience |
| deactivated user throws `UnauthorizedException` instead of `DomainError` | the two unit assertions and the pipeline's 403-body assertion |
| the P2002 provisioning retry removed | both unit concurrency tests, and the HTTP one |
| `JwtAuthGuard` defaults to allow instead of deny | 15 of 20 pipeline tests |
| failure reporting removed from `getSigningKey` | 7 of the 8 diagnosability tests |
| the log throttle's interval reduced to zero | 3 throttle tests and the "one line, not 25" test |

The third of those found a real weakness in the test suite rather than in the code: the
HTTP-level concurrency test initially passed *with the retry deleted*, because each `fetch`
costs enough event-loop time that the first request finished provisioning before the second
had read. The store's insert is now held open so the six requests genuinely race.

### What is **not** covered here

- **No real Postgres.** The unique constraints are modelled by
  `testing/in-memory-user-store.ts`, which raises a genuine
  `Prisma.PrismaClientKnownRequestError` P2002 with the `meta.target` Postgres produces. The
  retry logic and the outcome are exercised; that Postgres raises P2002 for these particular
  indexes is inherited from `schema.prisma` and verified in CI.
- **No real `mock-oauth2-server`.** The protocol is exercised, that container's exact
  discovery document and default claim set are not. In particular, **check on the first
  `docker compose up` that its tokens carry an `email` claim** — if they do not, a first-time
  dev login will hit the "no email claim" 401 until the client requests the `email` scope.

---

## Adding an authenticated route

```ts
@Controller('spots')
export class SpotsController {
  // Authenticated by default. Nothing to add.
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) { … }

  // Admin only.
  @Roles('ADMIN')
  @Post()
  create(@CurrentUser() admin: AuthenticatedUser) { … }
}
```

And the rarer case:

```ts
// No token; authenticates on the secret in its own URL. Pair with the
// stricter rate-limit tier, because it is reachable without a session.
@Public()
@StrictThrottle()
@Get('ics/:token')
feed(@Param('token') token: string) { … }
```

`@Roles()` takes the contract's `UserRole`, so a typo does not compile.

---

## For Task 15 (Socket.io)

`AuthModule` exports `JwksVerifierService` and `AuthUserService`. A WebSocket handshake
cannot run a Passport HTTP strategy, so the gateway should call
`JwksVerifierService.verifyToken(raw)` and then `AuthUserService.resolve(claims)` — reusing
this process's single JWKS client and the identical verification rules and provisioning path.

Do **not** construct a second `JwksClient` (or reach for `jwksRsa.passportJwtSecret()`): two
caches means two rotation moments and two rate limiters, so a key rotation could be visible
over HTTP and not yet over WebSocket. `doc/decision/0042-*` explains it.
