# 0189 – The sign-out spec keeps an assertion that fails about once in ten

> **Resolved by Task 33. The hypothesis below was wrong; the defect was real.**
>
> The missing datum this record asked for — the request `Cookie` header, and the
> ordering of `/api/auth/session` against `/api/auth/signout` — was captured.
> The result overturns *Hypothesis one*: **`/api/auth/session` is not on the
> sign-out path** — 0 requests to it in any of 20 recorded sign-out journeys.
> It cannot be there: `AuthProvider` always receives the session the root layout
> already read, so `SessionProvider`'s mount fetch early-returns, and `signOut()`
> with the default `redirect: true` returns before its own session fetch. (The
> endpoint is not dead in general — a long-lived tab polls it every 300 s and on
> window focus — it is simply never in flight during a sign-out, which is all
> the hypothesis needed.)
>
> What the capture showed instead is broader than one endpoint: under
> `strategy: 'jwt'` **every** server render that reads the session re-issues the
> cookie. One navigation to `/` was measured answering with three different
> session cookies — the document render plus two `?_rsc` prefetches, each
> request carrying the one the previous response set. The sign-out clear is
> therefore racing every concurrent render, and the browser keeps whichever
> `Set-Cookie` lands last. (Deleting a cookie is not a revocation mechanism at
> all: the token stays valid, and a copy of it keeps working.)
>
> Because that ordering is not the application's to control, the fix is **not**
> the client-side ordering change this record expected. Sign-out now revokes the
> session server-side. The measurement, the reasoning, and the ordering
> alternatives that were rejected are in `doc/decision/0230-*`; the
> Next.js-specific trap that made the first attempt silently do nothing is in
> `doc/decision/0231-*`; the recorder is `doc/decision/0232-*`.
>
> The severity note below stands as written, and its open question — "with no
> server-side revocation, a surviving JWT cannot be invalidated even once the
> race is fixed" — is answered in `0230-*`: revocation was implemented. The one
> part that remains open, deliberately and with reasons, is the Okta **access
> token**, which is not revoked at the issuer.
>
> `login.spec.ts:100` — the same test this record opens on at `:76`, moved down
> the file by the specs added since — is unchanged: not retried, not relaxed,
> not `fixme`. It is joined by a deterministic sibling that asserts the same
> property without needing the race to occur.
>
> Line numbers below are as of this record's writing. `:76` and `:100` are the
> same test; the sections after this one are left as the record of their moment.

## What

`login.spec.ts:76` — *"signing out returns to the sign-in screen and the lot is
protected again"* — fails intermittently, and is being left exactly as it is.
No retry, no relaxed assertion, no `test.fixme`.

It is not a flaky test. It is a **reproducible application defect** that only
shows up under load, and the assertion is the thing that found it.

## Why — what the trace shows

Measured across 35 full-suite runs (20 + 15), ports 3000 and 4200 killed before
each loop, `retries: 0`:

| loop | runs | failures of this test |
| --- | --- | --- |
| 20× stability | 20 | 2 (runs 7, 8) |
| 15× with `--trace retain-on-failure` | 15 | 1 (run 3) |
| the spec **in isolation**, 12× | 12 | **0** |

Three failures in 35, none in twelve isolated runs — and in the first loop the
two failures were the two **slowest** runs of the twenty (22.7 s and 20.9 s
against a ~18 s median). It needs the rest of the suite running beside it.

The retained trace says what happens. Requests to the web app, in order, with
the cookie headers that matter:

```
POST /api/auth/signout   → 200   Set-Cookie: authjs.session-token=; Max-Age=0
GET  /login         → 200   (login screen renders; no bounce to /)
GET  /                   → 200   Set-Cookie: authjs.session-token=<a fresh JWT>
POST /api/rpc/me/get     → 200
POST /api/rpc/overview/day → 200
```

Read that middle pair twice, because it is the whole finding:

1. The sign-out **worked**. The response cleared the session cookie.
2. `GET /login` came back **200 with the login screen**. `LoginPage` calls
   `auth()` and redirects a signed-in visitor to `/`; it did not. So at that
   moment there was no session. This is also why the spec's first assertion
   (line 90) passes.
3. The very next navigation, `GET /`, came back **200 instead of the 307 the
   proxy issues for an unauthenticated request** — and carried a **newly issued
   `authjs.session-token`**.

There is **no `/authorize` request anywhere after the sign-out**, so this is not
a fresh login: nothing re-authenticated against the issuer. The captured page
snapshot shows how complete the result is: the lot renders with
`Uživatelské menu: Dev User`, `9 volných`, and the group regions — data that
only arrives with a working bearer token.

So: **a completed sign-out can be undone by the next navigation.** The user
clicked "Odhlásit se", saw the sign-in screen, and one navigation later was
signed in again. That much is observed.

### What is inference, and not observation

An earlier version of this record said the server "resurrected" the session.
**That is a step further than the evidence goes, and it is corrected here.**

The `Set-Cookie` on `GET /` is *not* evidence that a cookieless request was
handed a session. Under `strategy: 'jwt'`, plus this application's access-token
refresh in the `jwt` callback, re-issuing the session cookie is the **ordinary
signature of a request that arrived carrying a valid one** — and there is no
Auth.js path that mints a session for a request with no cookie at all.

The datum that would settle it was not captured: **the request `Cookie` header
on that `GET /`.** The trace records response headers only. So the honest
statement is that the cookie was present again by the time of that request, and
*how* it got there is not yet known.

**Hypothesis one — since measured and found wrong; see the note at the top of
this file and `doc/decision/0230-*`. Kept as written because the reasoning that
led to it is sound and the way it failed is instructive: the endpoint it names
is never called by this application, and the real re-issuer is every ordinary
page render.**

**Hypothesis one: a concurrent `GET /api/auth/session` re-installs it.**
next-auth's own client `signOut` triggers a session fetch, and under `jwt` that
endpoint re-issues the cookie. If that request is in flight while the sign-out
response is clearing it, the clear is immediately undone. This fits everything
measured: it is a race, which explains the load dependence; it needs the rest of
the suite competing for the machine, which explains 0 failures in 12 isolated
runs; and it requires no server-side misbehaviour at all.

Whoever fixes this should start by capturing that request header — and the
ordering of `/api/auth/session` against `/api/auth/signout` — rather than by
reading Auth.js's source for a resurrection path that probably is not there.

### Severity: Medium

Real and security-relevant, and bounded:

- Sign-out here is **cookie deletion with no server-side revocation**. There is
  no session table and no token blacklist — the JWT is self-contained, so a copy
  that survives deletion **stays valid until it expires**, and the access token
  inside it keeps working against the API.
- The realistic harm is a **shared or unattended machine**: someone signs out,
  sees the sign-in screen, walks away, and the next navigation in that browser
  is signed in as them.
- It is **not a privilege boundary failure** — no cross-user exposure, no
  escalation; the surviving session is the user's own.
- It is **not attacker-inducible** as far as anything here shows: the trigger is
  a timing race in the user's own browser, not something a third party can
  provoke.

## Why the test is not being adjusted

Because every way of making it green is a way of not knowing.

- **A retry** would pass on the second attempt and report nothing.
  `playwright.config.mts` keeps `retries: 0` precisely so that a scenario which
  only passes when repeated stays visible.
- **Asserting more loosely** — dropping the second `toHaveURL`, or checking only
  that the sign-in screen appeared — would delete the assertion that caught it.
  The first check (line 90) passes in every failure; it is the *protection*
  check that fails.
- **`test.fixme`** would take the measurement away. Three in thirty-five is a
  rate worth watching, and it will change when the defect is fixed.

The cost is a suite that goes red roughly one run in ten for a known reason.
`doc/testing.md` names the symptom and points here, so the next person to see it
does not spend the afternoon this took.

**This was escalated rather than decided alone, and the ruling was to keep the
assertion** — unretried, unquarantined, not `fixme` — until the sign-out fix
lands as its own task, on the grounds that marking it would make a
security-relevant defect invisible. Anyone wanting to revisit that trade should
revisit it deliberately, not by quietly adding a retry.

## Why the fix is not in this task

It is an application change to session handling — the part of the system where
being wrong is worst — and it needs its own tests and its own review. This is an
e2e task; the same line was drawn for the duplicate socket.io connection in
`doc/decision/0187-*`.

For whoever picks it up, the useful starting points:

- The trace above is reproducible: run the full suite in a loop with
  `--trace retain-on-failure` and read `0-trace.network` from the retained
  `trace.zip`. Three failures in thirty-five runs is enough to catch one in
  under half an hour.
- **Start by capturing the request `Cookie` header** on that `GET /` — the one
  datum this record is missing. It decides everything: a cookie present means
  something re-installed it after the clear (hypothesis one above), and a cookie
  absent would mean something far stranger, in Auth.js itself.
- Then log the ordering of `/api/auth/session` against `/api/auth/signout`.
  next-auth's client `signOut` triggers a session fetch, and under `jwt` that
  endpoint re-issues the cookie; a fetch still in flight when the sign-out
  response lands would undo the clear.
- Whether the API should care is a separate question: the access token in that
  surviving session is still valid and unexpired, so the API is behaving
  correctly in accepting it. Sign-out here is a web-session concern — though see
  the severity note: with no server-side revocation, a surviving JWT cannot be
  invalidated even once the race is fixed.

## Risk

- **The suite is not green on every run, and this record is the reason it is
  allowed not to be.** Anyone treating a red suite as "the known sign-out flake"
  without reading the failure will eventually wave through a different one. The
  distinguishing marks: it is always `login.spec.ts:76`, always the second
  `toHaveURL`, and always `http://localhost:4200/` as the received value.
- **Recording a defect is not fixing it.** Until the session-handling task is
  done, sign-out in this application is not reliably durable, and that is a
  security-adjacent property. Named here so it is not discovered later as a
  surprise.
