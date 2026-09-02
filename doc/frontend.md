# The web application

`apps/web` is the Next.js 16 App Router front end. This document describes the
shell that Task 23 established: the route tree, the single client boundary and
the order its providers nest in, the sign-in flow, the three screen states that
feature screens compose, the health route, and how Tailwind is wired to the
design system's tokens.

Everything user-facing is Czech; everything else — identifiers, comments, this
file — is English (`doc/decision/0029-*`). No UI string is written in a
component: they all come from `libs/i18n`.

## What a screen may import

The wrapper rule from `plan.md` applies here more than anywhere, because this
is the code most tempted to reach past it. App code imports the wrapper, never
the library:

| Instead of | Import |
|---|---|
| `next-auth`, `next-auth/react` | `@lets-park/auth`, `@lets-park/auth/client` |
| `@tanstack/react-query` | `@lets-park/query` |
| `@tanstack/react-table` | `@lets-park/design-system/compounds` (`DataTable`) |
| `socket.io-client` | `@lets-park/realtime-client` |
| `next-intl` | `@lets-park/i18n` |
| `react-hook-form` | `@lets-park/form` |
| `@orpc/client` | `@lets-park/api-client` |

`no-restricted-imports` in `eslint.config.mjs` enforces this and `web:lint`
runs with `--max-warnings=0`, so a direct import is a build failure rather than
a review comment. It has been probed rather than assumed — a file importing
`next-auth/react`, `@tanstack/react-query` and `socket.io-client` produced
three errors and exit code 1, including for the `next-auth/react` *subpath*.

## Route tree

```
src/app/
  layout.tsx                    root: <html lang="cs">, tokens, fonts, <Providers>
  global.css                    Tailwind entry, imports the token theme
  providers.tsx                 the one 'use client' boundary
  error.tsx                     React error boundary  -> <ScreenError onRetry={reset}>
  not-found.tsx                 404
  prihlaseni/page.tsx           login (server component + Server Action)
  api/auth/[...nextauth]/route.ts   Auth.js handlers
  api/health/route.ts           readiness probe
  (app)/
    layout.tsx                  <AppTopBar> + centred <main>
    loading.tsx                 route-level <ScreenLoading>
    page.tsx                    /          parking overview
    nastaveni/page.tsx          /nastaveni settings
    sprava/page.tsx             /sprava    administration (admin only)
```

Paths are Czech and every one of them is declared once, in
`src/routes.ts` — `LOT_ROUTE`, `LOGIN_ROUTE`, `SETTINGS_ROUTE`, `ADMIN_ROUTE`,
`AUTH_API_ROUTE_PREFIX`, `HEALTH_ROUTE`. `auth.ts` and `proxy.ts` both read
`LOGIN_ROUTE` from there, which is what makes a redirect loop unconstructible:
the path Auth.js redirects *to* and the path the proxy exempts cannot drift
apart.

The `(app)` route group exists so the top bar and the page container wrap every
signed-in screen without appearing in a URL. The login page sits outside it —
it is a blank page by design.

## The client boundary

`app/providers.tsx` is the **only** `'use client'` boundary in the app shell.
Every wrapper lib ships its provider without a `'use client'` directive of its
own, precisely so the app marks the boundary once and composes them in one
place.

```
AuthProvider            session (server-rendered, so no signed-out flash)
└── IntlProvider        Czech copy + Europe/Prague formatting
    └── QueryProvider   one QueryClient per mount
        └── ApiProvider oRPC client built from the session's token
            └── RealtimeBoundary   socket, opened only once signed in
```

The order is load-bearing, not stylistic:

1. **`AuthProvider` outermost** — everything below reads the session. The API
   client takes its bearer token from it; the socket takes its handshake token
   from it.
2. **`IntlProvider`** above the data layers, so a failure rendered by any
   screen already has Czech copy available.
3. **`QueryProvider` then `ApiProvider`** — the client is built from the token
   provider (so it must be inside `AuthProvider`), and the query utilities are
   built from the client.
4. **`RealtimeBoundary` innermost** — the only one needing both a session
   *status* and a token, and it holds the socket closed until there is one.

The `QueryClient` is created in `useState`'s initialiser, so it survives
re-renders (a client built in the render body would throw its cache away every
time) and is per-request on the server, which is what SSR needs. It comes from
`createQueryClient()`, never `new QueryClient` — the retry and caching policy
is a product decision owned by `libs/query`, and the class is exported
type-only so this cannot be bypassed.

`layout.tsx` reads the session on the server with `await auth()` and passes it
down. Passing `null` states "there is no session, I checked"; omitting it would
start Auth.js in `loading` and render every visitor as signed-out for a frame.

## The three URLs derived from `NEXT_PUBLIC_API_URL`

`src/api-url.ts`. The configured value (`http://localhost:3000/api`) is the
API's base URL and is **not itself** any of the endpoints the app calls:

| Consumer | Function | Result |
|---|---|---|
| oRPC client | `apiRpcUrl(url)` | `…/api/rpc` — the RPC transport is a controller under the global prefix |
| health route | `apiReadinessUrl(url)` | `…/health/ready` — the API's probes are excluded from `setGlobalPrefix` |
| Socket.io | `apiOriginOf(url)` | origin only — `io()` reads a path as a **namespace** |

Each has a silent failure mode, so each is a named function with specs. Full
reasoning and the measurements behind it: `doc/decision/0101-*`.

## Sign-in

There is no test path and no bypass. Development, e2e and production all run
the same code and differ only in environment values.

1. An unauthenticated request to any protected path hits `src/proxy.ts`, which
   re-exports Auth.js's `auth` as Next 16's request interceptor. It redirects
   to `/prihlaseni?callbackUrl=…`. See `doc/decision/0100-*` for the matcher
   and why the file is `proxy.ts` rather than `middleware.ts`.
2. `prihlaseni/page.tsx` is a **server** component. If a session already
   exists it redirects to `/`; otherwise it renders `LoginScreen` with a
   Server Action:

   ```ts
   async function signInWithOkta() {
     'use server';
     await signIn(OKTA_PROVIDER_ID, { redirectTo: LOT_ROUTE });
   }
   ```

   The screen is a blank page with the brand, two lines of Czech copy and one
   pill button, `Login přes OKTA Verify` — per the design. Because the action
   is a form submission, the page needs no client JavaScript to work.
3. Auth.js redirects to Okta (the mock OIDC server in development) with
   `response_type=code`, `scope=openid profile email offline_access` and PKCE
   `S256`.
4. The provider redirects back to `/api/auth/callback/okta`, handled by
   `app/api/auth/[...nextauth]/route.ts`, which is `libs/auth`'s `handlers`
   and nothing else.
5. The session cookie is set and the user lands on `/`.

**Signing out** goes through `signOut({ redirectTo: LOGIN_ROUTE })` from the
avatar menu.

**Tokens.** The access token lives in the encrypted session cookie. It is never
written to `localStorage` or `sessionStorage`, never rendered, and never
logged. The browser gets it only as a `Authorization: Bearer` header added by
`libs/api-client`, and as `socket.handshake.auth.token` — never a query string
(`doc/decision/0060-*`). `AUTH_SECRET` and the OAuth client secret are read
from `process.env` on the server; neither carries a `NEXT_PUBLIC_` prefix,
which would publish it to every visitor.

### Dev environment notes, measured

- The mock OIDC server issues **no `email` claim by default**. The API refuses
  such a token (`The token does not identify a provisionable user.`). Supply
  `{"email":"…","name":"…"}` in the mock login form's *Optional claims JSON*
  field, or configure the mock server with a user that has them.
- The mock server's access token carries `aud: "default"`. The API's
  `AUTH_OKTA_AUDIENCE` has to match it, or every request is a plain 401.

## The top bar

`shell/top-bar.tsx` is **presentational** — props in, callbacks out, no data
fetching — and `shell/app-top-bar.tsx` is the connected wrapper. Left: the
brand, wrapped in a link to `/`. Right: an `Admin` badge for administrators,
then the avatar with the user's initials, their name, and a dropdown holding
their name and email, `Nastavení (SPZ auta)`, `Správa` (administrators only)
and `Odhlásit se`.

The role comes from the contract's `me.get` (`shell/use-current-user.ts`), not
from the session — Auth.js's session carries only the access token. The
consequence is that while the profile is loading or has failed, `role` is
`undefined` and `isAdmin` is `role === 'ADMIN'`, which is **false**. The badge
and the `Správa` entry are absent rather than present-and-broken. This is a
convenience, not a control: the API's `RolesGuard` is what actually enforces
the role, and `/sprava` renders a `FORBIDDEN` empty state for a non-admin who
navigates there directly.

`initialsOf()` (`shell/initials.ts`) takes the first letter of the first two
words, uppercased with `cs-CZ` rules, iterating code points so a name outside
the BMP is not cut in half.

## Loading, empty and error

`shell/screen-state.tsx` exports all three from one module, so a screen imports
its states from a single place:

- **`ScreenLoading`** — `role="status"` with the default polite live region, so
  a screen reader announces the wait; label defaults to `Načítá se…`.
- **`EmptyState`** — re-exported from `@lets-park/design-system/compounds`
  rather than reimplemented.
- **`ScreenError`** — takes whatever the failing call threw, reads it through
  `toContractError`, and renders a Czech sentence **keyed off the error's
  code**. The error's own `message` is never shown: a contract error's message
  is developer-facing English by design, and a transport failure's message is a
  stack-adjacent string. An unrecognised code and a transport failure both fall
  back to one generic sentence. An optional `onRetry` renders a secondary
  button; without it there is no control.

Two places wire these up for free: `(app)/loading.tsx` gives every route a
suspense fallback, and `app/error.tsx` renders `ScreenError` with `reset` as
the retry.

These live in app code rather than in the design system on purpose. Composing
primitives and compounds into domain UI is app work; `EmptyState` is the
design-system piece, and `ScreenError` is this application's opinion about how
a contract error becomes a sentence.

## `/api/health`

A readiness probe for the *pair*. It calls the API's `/health/ready` with a
4-second timeout and answers `200` `{"status":"ok",…}` or `503`
`{"status":"error","checks":{"api":{"status":"down","reason":…}}}` where the
reason is one of `unreachable | timeout | not-ready | not-configured` — a fixed
enum, never upstream text, so nothing internal can leak through a probe. Both
directions carry `cache-control: no-store`. It is exempt from the session
check, because an orchestrator carries no cookie. See `doc/decision/0103-*`.

Note the upstream path: the API's probes are **`/health/ready`**, not
`/api/health/ready` — `configureApp()` excludes them from the global prefix.

## Styling

`app/global.css` is the Tailwind v4 entry point. It imports the design
system's theme (which is itself `@import 'tailwindcss'` plus the token file and
an `@theme inline` block), then declares the three source trees Tailwind should
scan for class names:

```css
@import '../../../../libs/design-system/tokens/assets/theme.css';
@source '../../src';
@source '../../../../libs/design-system/primitives/src';
@source '../../../../libs/design-system/compounds/src';
```

The `@source` lines are required: Tailwind v4 scans the importing project by
default, and without them every class used *inside* a primitive or compound
would be absent from the app's stylesheet.

`apps/web/postcss.config.mjs` loads `@tailwindcss/postcss`, which is Next's
side of the same wiring (Storybook uses `@tailwindcss/vite`).

Tokens are used through their Tailwind names (`text-fg-3`, `border-border`,
`rounded-cta`) or as CSS variables where no utility exists
(`h-16 z-[var(--z-sticky)]`, `max-w-[var(--container)]`). No raw hex value,
radius or spacing number is written in `apps/web`.

## Environment

`src/env.ts` holds the Zod schema; `instrumentation.ts` → `register()`
validates it once at boot and `instrumentation-node.ts` calls
`process.exit(1)` on failure, so no request is ever served by a misconfigured
process. Keys may be added, never loosened, and durations are milliseconds with
an `_MS` suffix.

The one exception is `src/auth.ts`, which reads raw `process.env`. It is
imported during page-data collection, and calling the validator there would
make `next build` require production secrets — which `doc/decision/0008-*`
recorded as something the build does not do. The reasoning, and the check that
a build still passes with no environment at all, is in `doc/decision/0102-*`.

## Tests

`nx run web:test`. Jest with `next/jest`, jsdom plus Node's fetch/stream
globals (`jest-environment-web.cjs`), and `@testing-library/jest-dom`.

Two details worth knowing before adding a suite:

- **`transformIgnorePatterns` has to be overwritten on the *resolved* config.**
  `next/jest` *appends* a custom `transformIgnorePatterns` after its own
  entries, and discards one coming from a preset entirely. Appending is no use:
  the array is a union — Jest skips a file that matches *any* entry — and
  Next's own `/node_modules/(?!.pnpm)(?!(geist)/)` already matches everything in
  `node_modules` but `geist`. So the ESM-only exemption is applied to the
  resolved object at the bottom of `jest.config.cts`, after `createJestConfig`
  has run. Adding a dependency that ships ESM-only means adding it to
  `esmOnlyPackages` there.
- **`FormData`, `Blob` and `File` are deliberately jsdom's**, unlike in
  `libs/query`'s otherwise identical environment. React 19 implements a form
  `action` by calling `new FormData(formElement)`, and Node's `FormData`
  rejects an element.

`ScreenError`'s suite builds its errors by driving a **real** `RPCLink` with a
stubbed `fetch`, rather than constructing an oRPC error by hand: a hand-built
error asserts the test's idea of the wire shape instead of the transport's.
