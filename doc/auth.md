# Authentication

> **Scope of this document.** Task 20 built the **frontend** half: `libs/auth`, the wrapper
> over next-auth v5 / Auth.js. The backend half — JWKS validation of Okta tokens in
> `apps/api`, the `AuthGuard`/`RolesGuard`, JIT user provisioning, `icsToken` generation — is
> Task 11 and has **not landed on this branch yet**; `apps/api/src` has no auth directory.
> The sections below marked _(Task 11)_ describe what the frontend is built to talk to, not
> what exists. Task 11 extends this file with the backend half; Task 15 with the Socket.io
> gateway; Task 23 with the actual sign-in page and route wiring.

## The flow

```
browser                    apps/web (Next.js server)          Okta / mock-oauth2-server
   │                                │                                    │
   │  GET /any-protected-route      │                                    │
   ├───────────────────────────────►│                                    │
   │                                │  middleware → callbacks.authorized │
   │  302 to the sign-in page       │  (no session → false)              │
   │◄───────────────────────────────┤                                    │
   │  signIn('okta')                │                                    │
   ├───────────────────────────────►│  302 to /authorize (PKCE + state)  │
   │◄────────────────────────────────────────────────────────────────────┤
   │  … user authenticates …                                             │
   ├────────────────────────────────────────────────────────────────────►│
   │  302 /api/auth/callback/okta   │                                    │
   ├───────────────────────────────►│  code → /token                     │
   │                                ├───────────────────────────────────►│
   │                                │  access_token, refresh_token, id_token
   │                                │◄───────────────────────────────────┤
   │                                │  callbacks.jwt seeds the JWT       │
   │  Set-Cookie: encrypted, httpOnly session                            │
   │◄───────────────────────────────┤                                    │

later, from the browser:
   │  GET /api/auth/session (poll, every 300 s)                          │
   ├───────────────────────────────►│  callbacks.jwt → renew if within   │
   │                                │  60 s of expiry ───────────────────►│
   │                                │◄─────────────── new access_token ──┤
   │  { user, accessToken, expires }│  callbacks.session projects it     │
   │◄───────────────────────────────┤                                    │

and against the API:
   │  Authorization: Bearer <access_token>          apps/api (Task 11)   │
   ├────────────────────────────────────────────────────────────────────►│
   │                                   validates iss / aud / exp / sig    │
   │                                   against the issuer's JWKS          │
```

## Environment

Four variables, all validated fail-fast in `apps/web/src/env.ts` (`.env.example` documents
them):

| variable | used for |
| --- | --- |
| `AUTH_SECRET` | encrypts the Auth.js session cookie. ≥ 32 characters. |
| `AUTH_OKTA_ISSUER` | the OIDC issuer. Shared verbatim with `apps/api`. |
| `AUTH_OKTA_CLIENT_ID` | the web app's OAuth2 client. |
| `AUTH_OKTA_CLIENT_SECRET` | its secret. Server-side only. |

There is deliberately **no** `AUTH_TRUST_HOST`, and that absence is load-bearing. Auth.js
refuses to serve `/api/auth/*` at all unless `trustHost` is true, and computes it as
`!!(AUTH_URL ?? AUTH_TRUST_HOST ?? VERCEL ?? CF_PAGES ?? NODE_ENV !== 'production')`. This
deployment sets none of the first four and runs `NODE_ENV=production`, so the inherited
default would be `false` **in production and nowhere else** — dev and e2e stay green for
free, and the first real deploy would answer every `/api/auth/*` request with
`UntrustedHost: Host must be trusted`. `createAuthConfig` therefore states `trustHost: true`
outright: it is a property of the deployment topology (single instance, one reverse proxy in
front), not of an environment, and adding a fifth variable would put the decision back in the
place this lib's rules keep it out of. `create-auth.spec.ts` drives the real route handler
under `NODE_ENV=production` with all four variables removed and asserts a 200.

`AUTH_OKTA_ISSUER` is the **only** Okta URL anywhere in the configuration. The authorization
and token endpoints are discovered from `${issuer}/.well-known/openid-configuration`, and so
is the JWKS URI the API will use — see `doc/decision/0041-*`. In dev and e2e the value points
at the `mock-oauth2-server` container; in production at the real org. **The code is
identical**: there is no `if (isTest)`, no bypass flag, no credentials provider, and no
test-only branch anywhere in `libs/auth` (global constraint 8).

The two secrets are read from `process.env` in `apps/web` and passed to `createAuth` as
arguments. `libs/auth` reads no environment variable of its own — Auth.js's implicit
`AUTH_SECRET` / `AUTH_OKTA_ID` / `AUTH_OKTA_SECRET` inference is deliberately bypassed so that
`apps/web/src/env.ts` stays the one schema that decides which variables exist. Neither secret
carries a `NEXT_PUBLIC_` prefix, which is the only thing that would put it in the browser
bundle.

Okta must have `https://<host>/api/auth/callback/okta` registered as a redirect URI — the path
is derived from the provider id, which is why `OKTA_PROVIDER_ID` is a constant and not a
literal.

## The audience the two halves agree on

`apps/api` (Task 11) validates the bearer against `AUTH_OKTA_AUDIENCE` and rejects any token
whose `aud` differs. `libs/auth` sends **no** `audience` and no `resource` parameter, at
`/authorize` or at `/token`, so whatever `aud` ends up in the token is entirely the issuer's
choice. That makes `AUTH_OKTA_AUDIENCE` a value that has to match the issuer, not a value the
two halves can be assumed to share.

**Dev and e2e: `AUTH_OKTA_AUDIENCE=default`.** `docker-compose.yml` starts
`mock-oauth2-server` with no `JSON_CONFIG`, so its `DefaultOAuth2TokenCallback` decides the
audience in this order — configured audience, then the request's `audience` parameter, then
the token request's non-OIDC scopes, else `["default"]`. There is no configured audience, we
send no `audience` parameter, and Auth.js v5's code exchange sends no `scope` on the token
request at all (our refresh POST sends only `grant_type` and `refresh_token`). Even a
scope-bearing request would come out empty, because the callback filters against Nimbus's
`OIDCScopeValue`, which covers `openid`, `profile`, `email` **and** `offline_access` — every
scope we ask for. So the last branch applies and the token carries `aud: ["default"]`.

**Production: the issuer must be a Custom Authorization Server.** A Custom AS
(`https://<org>.okta.com/oauth2/<id>`, e.g. `/oauth2/default`) mints access tokens whose `aud`
is that server's configured audience — `api://default` for Okta's built-in one, which is what
`AUTH_OKTA_AUDIENCE` should be set to there. Point `AUTH_OKTA_ISSUER` at the **Org**
Authorization Server instead (`https://<org>.okta.com`, no `/oauth2/...`) and `aud` becomes
the org URL, so the same 401 appears — in production only. That is the silent precondition on
this variable, and it is the reason to treat "which issuer URL" as an auth decision rather
than a copy-paste.

> **This is a reasoned prediction, not a verified fact.** No container was running when it was
> written (`docker info` reports the daemon down on both the implementation and the review
> machine), so no access token has actually been decoded. The dev/e2e half is derived from
> `mock-oauth2-server`'s upstream `DefaultOAuth2TokenCallback` plus the installed
> `@auth/core`; the production half is derived from Okta's documented Custom-vs-Org AS
> behaviour and has no second source at all.
>
> **What would falsify it:** decode the `access_token` from one real sign-in and read `aud`.
> If dev shows anything other than `default` — or production anything other than the Custom
> AS's audience — this section and `.env.example` are wrong together, and the symptom will be
> `401 JsonWebTokenError: jwt audience invalid` on every API call while sign-in itself works.
>
> **Task 28 settles it.** Its Playwright login flow is the first thing in this build that runs
> the real OIDC redirect against `mock-oauth2-server` end to end; a request that reaches an
> authenticated API route proves the audience matches, and Task 28 should decode one token and
> replace this callout with the value it found. Task 11's own suggestion — "compare
> `AUTH_OKTA_AUDIENCE` against the `aud` your IdP actually mints" — is exactly this check.
>
> If the value does turn out to be wrong, the fix stays in `.env.example`: mounting a
> `JSON_CONFIG` on the container so it mints `api://default` is the alternative, and it has the
> advantage of making the dev and production values identical. Neither option touches code,
> which is what keeps "same code, only env values differ" true.

## What the browser can see

| value | lives in | reaches the browser? |
| --- | --- | --- |
| refresh token | the encrypted httpOnly session cookie | **no** |
| access token | that cookie, and React state after `/api/auth/session` | yes, in memory only |
| `AUTH_SECRET`, client secret | `process.env`, server only | **no** |

Nothing is written to `localStorage`, `sessionStorage`, or a JS-readable cookie. The browser
needs the access token because `libs/realtime-client` (Task 21) puts it in the Socket.io
handshake; the refresh token it has no use for, and never receives. Reasoning and how it is
tested: `doc/decision/0043-*`.

## Refresh token rotation

`offline_access` is requested at sign-in — without it Okta issues no refresh token at all and
the session would die with the first access token.

Rotation lives in the `jwt` callback:

1. **At sign-in**, `account.access_token` / `expires_at` / `refresh_token` are copied onto the
   JWT.
2. **On every later session read**, a token more than 60 s (`REFRESH_SKEW_SECONDS`) from
   expiry is returned untouched.
3. **Inside that window**, the refresh token is exchanged at the discovered token endpoint.
   Renewing *before* expiry rather than at it is what stops the renewed request from racing
   the old token's `exp`.
4. **On failure**, the access and refresh tokens are dropped and `error: 'RefreshTokenError'`
   is set. The session is not retried while that flag is present.

A tab sitting idle re-reads `/api/auth/session` every 300 s (`SESSION_REFETCH_SECONDS`), which
is what makes step 3 fire at all — the callback only runs when something asks for the session.
See `doc/decision/0045-*`.

### Concurrent renewals

One page load reads the session more than once — a root layout, a Server Component and a Route
Handler each calling `await auth()`, plus the browser's poll. If they land inside the same
renewal window they all hold the same refresh token, and with rotation enabled the first grant
invalidates it under the others: they get `invalid_grant`, the session fails closed, and the
user is signed out mid-session for no visible reason.

Callers presenting the same refresh token therefore share a single in-flight grant. That
covers every caller in one process, which is the whole single-instance deployment. It does
**not** cover several processes or instances — that needs the `LockService` abstraction
`plan.md` mandates, and until it exists **Okta refresh-token rotation should stay switched
off** on the authorization server, which turns the remaining races into a redundant grant
rather than a sign-out. Nothing in this repo enforces that setting; `doc/decision/0047-*`
records the race, the residual cases and the upgrade path.

### When it fails

Not a silent 401. Three things happen, in the three places they have to:

- `getAccessToken()` returns `null`, so `createApiClient` omits the `Authorization` header
  entirely — the API answers "unauthenticated" rather than rejecting a stale token;
- `callbacks.authorized` returns `false`, so the middleware redirects the next navigation to
  the sign-in page;
- `useRequireAuth()` calls `signOut()`, clearing the dead cookie rather than signing in on top
  of it.

`doc/decision/0044-*` covers why sign-out rather than a retry or a forced `signIn`.

## Using it from the app

Server side:

```ts
// apps/web/src/auth.ts
export const { handlers, auth, signIn, signOut, getAccessToken } = createAuth({ … });

// app/api/auth/[...nextauth]/route.ts
export const { GET, POST } = handlers;

// middleware.ts
export { auth as middleware } from './src/auth';

// any Server Component / Route Handler / Server Action
const session = await auth();
const api = createApiClient({ url: env.NEXT_PUBLIC_API_URL, getAccessToken });
```

Browser side:

```tsx
'use client';
import { AuthProvider, useRequireAuth, useAccessTokenProvider } from '@lets-park/auth/client';

// in the app's provider boundary, with the server-read session handed down:
<AuthProvider session={session}>…</AuthProvider>

// in a protected screen:
const { session, status } = useRequireAuth();

// to give a transport its token:
const getAccessToken = useAccessTokenProvider();   // stable identity, latest session
```

`@lets-park/auth` and `@lets-park/auth/client` are separate entry points on purpose: the
server half pulls in Auth.js's route handlers and `next/server`, which have no place in a
browser bundle (`doc/decision/0042-*`). A Jest guard fails the build if the client entry ever
reaches the server modules.

## Testing against the mock OIDC server

`docker-compose.yml` runs `mock-oauth2-server`, and `AUTH_OKTA_ISSUER` in `.env.example`
points at its `default` issuer. It accepts any `client_id`/`client_secret`, serves a real
discovery document, and issues real signed JWTs, so the whole flow above is meant to run
unmodified — including refresh, because `libs/auth` reads the client-authentication method
out of the discovery document rather than assuming one (`doc/decision/0041-*`).

> **Unverified against a running container.** No Docker daemon was available while Task 20 was
> implemented or reviewed, so nothing below has been observed — only derived from
> `mock-oauth2-server`'s upstream source and the installed `@auth/core`. Two things for the
> first task that brings the container up (Task 28 at the latest):
>
> 1. **`token_endpoint_auth_methods_supported`** — `libs/auth` picks HTTP Basic or form-body
>    client authentication from it. All three branches are tested against a stubbed document;
>    which one the container actually takes is unobserved.
> 2. **The `aud` claim** — predicted to be `default`, which is what `.env.example` now sets
>    `AUTH_OKTA_AUDIENCE` to. See "The audience the two halves agree on" above for the
>    reasoning, what would falsify it, and the one-line fix if it is wrong.
>
> Decode one access token from a real sign-in and both questions are answered at once.

`libs/auth`'s own unit tests stub only `fetch` (`AuthOptions.fetch`, the same seam
`ApiClientOptions.fetch` already is) and drive the real callbacks, the real
`SessionProvider`, and a real `createApiClient`. The end-to-end path through a browser is
Playwright's job in Fáze 7.

## Key rotation _(Task 11)_

Okta rotates its signing keys. The API's JWKS client is expected to cache keys and re-fetch on
an unknown `kid`, which is why the JWKS URI is discovered rather than pinned. Nothing on the
frontend is affected — `libs/auth` never validates a token, it only carries one.
