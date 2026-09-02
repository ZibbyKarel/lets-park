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

> **Unverified.** The container was not started while Task 20 was implemented (no Docker
> daemon available in that environment), so the refresh leg has **not** been run against
> `mock-oauth2-server` end to end. What is verified is the code's behaviour against a stubbed
> discovery document in all three client-authentication branches. The first task that brings
> the container up — Task 11 for JWKS, or Fáze 7 for Playwright — should confirm what
> `token_endpoint_auth_methods_supported` actually contains there and correct this section if
> the container advertises something unexpected.

`libs/auth`'s own unit tests stub only `fetch` (`AuthOptions.fetch`, the same seam
`ApiClientOptions.fetch` already is) and drive the real callbacks, the real
`SessionProvider`, and a real `createApiClient`. The end-to-end path through a browser is
Playwright's job in Fáze 7.

## Key rotation _(Task 11)_

Okta rotates its signing keys. The API's JWKS client is expected to cache keys and re-fetch on
an unknown `kid`, which is why the JWKS URI is discovered rather than pinned. Nothing on the
frontend is affected — `libs/auth` never validates a token, it only carries one.
