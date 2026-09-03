# 0230 – Sign-out revokes the session, because deleting the cookie cannot win the race

## What

Signing out now records a **per-subject cutoff** on the server, and every later
session read refuses a token issued at or before it. Cookie deletion still
happens — Auth.js does it — but it is no longer the thing that makes sign-out
work.

`libs/auth/src/lib/revocation.ts` holds the cutoffs;
`applySessionLifecycle` in `libs/auth/src/lib/config.ts` consults them from the
`jwt` callback and returns `null` for a revoked session, which `@auth/core`
answers by **clearing the session cookie instead of re-issuing it**
(`lib/actions/session.js`).

This also settles the question `doc/decision/0189-*` left open — whether
sign-out should have server-side revocation at all. The answer is yes, and the
reason is not the threat model: it is that without it the defect does not close.

## Why — what was actually measured

`0189` recorded a sign-out that came undone one navigation later, and was
careful to say that *how* the cookie came back was not established. It named a
hypothesis — a concurrent `GET /api/auth/session`, which next-auth's own
`signOut` triggers — and asked for the request `Cookie` header to be captured
first.

That capture was done (`apps/web-e2e/src/support/auth-network-log.ts`,
`doc/decision/0232-*`). Three things came out of it, and the fix follows from
them rather than from the hypothesis.

**1. The hypothesis is wrong for this application.** `/api/auth/session` is
never requested at all — 0 occurrences across 20 captured sign-out journeys.
It cannot be, either: `AuthProvider` is always handed the session the root
layout already read (`await auth()`), so `hasInitialSession` is true, and
`SessionProvider`'s `_getSession()` early-returns instead of fetching
(`next-auth/react.js`). The only `/api/auth/*` requests a sign-out makes are
`GET /api/auth/csrf` and `POST /api/auth/signout`, and neither re-issues the
session cookie.

**2. Every render that reads the session re-issues the cookie.** This is the
real mechanism, and it is much broader than one endpoint. A single navigation to
`/` produced three different session cookies in under two milliseconds:

```
>  GET /                  cookie=#9fec66a7   <  200  set=#dceef266
>  GET /?_rsc              cookie=#dceef266   <  200  set=#4605bfb2
>  GET /?_rsc              cookie=#4605bfb2   <  200  set=#70533434
```

(Cookie values are never recorded; `#xxxxxxxx` is a truncated one-way digest,
enough to tell two tokens apart and useless for anything else.) Under
`strategy: 'jwt'` Auth.js re-encodes and re-sets the cookie on every session
read — page render, RSC prefetch, proxy check alike — because that is how a
rolling expiry works.

**3. So the sign-out clear is racing every concurrent render, and the browser
applies whichever `Set-Cookie` arrives last.** Nothing in the application
decides that order. Next.js's prefetcher issues `?_rsc` requests on its own
schedule, a response already on the wire cannot be recalled, and the document
stays alive — still applying `Set-Cookie` headers — until a navigation commits.

### Why the fix is not a client-side ordering change

That was the expected shape of the answer, and it does not hold up. To fix this
by ordering, the application would have to guarantee that **no** session-bearing
request is in flight across the sign-out. It cannot: it does not control when
the framework prefetches, and it cannot cancel a response that has already been
sent. Every ordering variant considered — a form POST navigation instead of
`fetch`, a Server Action, `signOut({ redirect: false })` followed by
`location.replace`, dropping `prefetch` on the top bar's `<Link>` — narrows the
window without closing it, and each leaves the fix depending on *which* request
happened to race, which the trace never captured.

Revocation does not depend on knowing which request raced. That is the argument.

### Why the key is `sub` + `iat`, and not `jti`

The obvious design fails, silently, and the reason is worth stating because it
would look correct in review: `@auth/core`'s `encode()` calls
`setJti(crypto.randomUUID())` on **every** issue (`jwt.js`). The token a racing
render re-installs therefore has a *different* `jti` from the one that signed
out. Revoking the id that signed out would leave the one that survived working.

So the record is keyed on the subject — the stable Okta user id — and holds a
cutoff in Unix seconds. `iat <= cutoff` refuses it; `iat > cutoff` honours it.

**`<=`, not `<`.** The racing render encodes its token *before* the sign-out
records the cutoff, so its `iat` — whole seconds, floored — is necessarily less
than or equal to the cutoff second, never greater. A strict `<` would let
exactly the token the race produces survive, and would pass every other test in
the suite. `revocation.spec.ts` pins the boundary case on its own.

The mirror ordering needs no separate handling: a render that reaches the `jwt`
callback *after* the cutoff is recorded sees the incoming (older) token as
revoked, returns `null`, and clears the cookie rather than re-issuing it. So the
surviving cookie is not merely refused — it deletes itself on first use.

Auth.js awaits `events.signOut` before pushing the clearing cookie
(`lib/actions/signout.js`), so the cutoff is in place before the sign-out
response leaves the server. That ordering is asserted, not assumed.

## What this does and does not close

**Closed.** A session cookie that outlives its sign-out — by this race, by a
copy taken from a browser profile, by anything — no longer authenticates against
`apps/web`. The realistic harm `0189` named, a shared or unattended machine,
is gone.

**Not closed: the Okta access token.** The session carries a bearer that
`apps/api` validates against the issuer's JWKS, and nothing here revokes it at
Okta. Somebody who has extracted that token from a session can keep calling the
API directly until it expires — minutes, not the cookie's thirty days. Calling
Okta's RFC 7009 revocation endpoint at sign-out would close that too; it is not
done here because it is a second, independent change with its own failure modes
(a revocation call that fails must not block a sign-out) and because the
exposure is bounded by a short lifetime and is not reachable through the browser
this fixes. Named here so it is a decision and not an oversight.

**Not closed: a restart forgets.** See `doc/decision/0231-*`.

## Risk

- **The cutoff store is in memory.** A restart of the Next.js server forgets
  every sign-out, and a token that had survived one would work again until it
  expires. This is the same posture, and the same single-instance premise, as
  `LockService` on the API side; `0231` records the boundary and the upgrade
  path. It is a narrower hole than the one it replaces — it needs a restart
  *and* a surviving token — but it is not zero.
- **Revocation is by subject, so it is all-or-nothing per person.** Signing out
  in one browser invalidates that person's sessions everywhere, including
  another device. For an internal parking app that is defensible and arguably
  what a user expects from "Odhlásit se"; it is not what a multi-device product
  would want, and a future per-session key would have to survive re-encoding
  (`jti` cannot — see above).
- **Signing out and back in inside the same second** would be refused by the
  cutoff alone. The sign-in branch drops the cutoff for that subject precisely
  so it is not, and `config.spec.ts` pins it — but it is a coupling between two
  branches of one callback, and removing either half breaks the other.
