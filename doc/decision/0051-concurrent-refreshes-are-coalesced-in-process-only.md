# 0051 – Concurrent token renewals are coalesced in-process only; the cross-process race is accepted for the MVP

**Date:** 2026-09-02 · **Status:** accepted · **Task:** 20 (`libs/auth`), review fix round 1
**Follows on from:** `doc/decision/0044-*` (a failed refresh signs the user out)

## What

`createTokenRefresher` keeps the **in-flight** token request in a closure variable, keyed by
the refresh token that started it. A caller arriving with the same refresh token while a grant
is on the wire gets that same promise instead of sending a second grant. The slot is cleared
as soon as the request settles — this coalesces callers, it does not cache a result.

The race across *separate processes* is **not** solved and is accepted for the MVP.

## Why

**The race.** `jwt` runs on every session read, and one page load can produce several: a root
layout, a Server Component and a Route Handler each calling `await auth()` is three, and the
browser's `/api/auth/session` poll can land on top. If they fall inside the 60-second renewal
window they each hold the same refresh token. With refresh-token rotation enabled on the
authorization server the first grant succeeds and **invalidates** that token; the rest come
back `invalid_grant`, `markRefreshFailed` fires, `error: 'RefreshTokenError'` is written by
whichever response sets the cookie last, and `useRequireAuth` signs the user out mid-session.

The direction of failure is right — the session fails closed and no stale bearer is ever sent
(`doc/decision/0044-*`). What is wrong is the **frequency**: a user gets bounced to Okta for
no visible reason, intermittently, and only in production, because `mock-oauth2-server` does
not rotate refresh tokens.

**Why in-process coalescing is worth doing.** `apps/web/src/auth.ts` calls `createAuth()` at
module scope, so the refresher closure is created once per server process and shared by every
request that process handles. The deployment target is a single instance
(`plan.md`, no Redis/BullMQ), which means in practice one process — so the coalescing covers
the whole realistic case, in about ten lines, with no new dependency and nothing to
administer. It is the same shape as the discovery-document promise cache that was already
there.

**Why not more than that.** A correct cross-process fix needs a lock and a place to put the
renewed tokens that all processes can read. `plan.md` mandates the `LockService` abstraction
precisely so that this class of problem has one home, and mandates equally that the MVP ships
no Redis. Inventing a second, auth-specific coordination mechanism here would pre-empt that
decision from the wrong layer.

**Alternative rejected: cache the result briefly.** Holding the last successful
`RefreshedTokens` for, say, 30 seconds keyed by the *consumed* refresh token would also rescue
a straggler that read the cookie before the winner's `Set-Cookie` arrived. It was rejected: it
means keeping a live access token and a rotated refresh token in process memory beyond the
request that needed them, for a benefit that only shows up in a narrower window than the one
coalescing already covers. Keeping tokens no longer than necessary is the same rule
`doc/decision/0043-*` applies to the browser.

**Alternative rejected: retry once on `invalid_grant`.** The retry would present the same dead
token, so it cannot succeed. Reading the cookie again mid-callback to pick up the winner's
tokens is not possible either — Auth.js hands the `jwt` callback the token it decoded at the
start of the request.

## How

`libs/auth/src/lib/refresh.ts`: the returned function checks `inFlight?.refreshToken` before
starting an exchange, and clears the slot on settle only if it is still the current entry (so
a slow failure cannot wipe a newer renewal's slot).

Exercised in `refresh.spec.ts`, with the token responses held open by a gate so the second
caller genuinely arrives mid-flight rather than in the same tick:

- two callers with the same refresh token produce **one** grant and identical results;
- two callers with *different* refresh tokens produce two grants — one session's tokens must
  never be handed to another;
- a second renewal after the first has settled makes its own request (coalescing, not
  caching);
- a failed renewal clears the slot, so the next attempt is not stuck on a rejected promise.

Probed by mutation: deleting the one-line `inFlight` check makes the first of those fail with
`Expected: 1 / Received: 2`.

## Risk if this is wrong

**The residual race is real and undetected.** Two cases survive:

1. **More than one process** — `next start` under a process manager with several workers, or
   two instances behind a load balancer. Each has its own refresher, so the original race
   returns in full. This is the case `LockService` is for, and it is the upgrade path: when
   the deployment stops being single-instance, the renewal has to take a distributed lock
   keyed by the session's `sub` before exchanging, and publish the result.
2. **A straggler in the same process** — a request that read the cookie *before* the winner's
   renewal, and calls `refresh` after it settled. It presents the old token, gets
   `invalid_grant`, and is signed out. Narrow, but not impossible.

**Operational consequence until then: keep refresh-token rotation switched off on the Okta
authorization server.** Without rotation the old refresh token stays valid and every one of
these cases degrades to a redundant grant rather than a sign-out. That is a configuration
choice nobody has made explicitly yet, and it should be made before the first production
deploy — it is not enforced by anything in this repo.

Nothing tests the residual race, because reproducing it needs two processes and a rotating
issuer, neither of which exists in this workspace. Task 28's e2e will not catch it either
(`mock-oauth2-server` does not rotate). It is recorded here rather than guarded.
