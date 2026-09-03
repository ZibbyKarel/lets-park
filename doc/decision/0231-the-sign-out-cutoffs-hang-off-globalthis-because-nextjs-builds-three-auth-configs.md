# 0231 – The sign-out cutoffs hang off `globalThis`, because Next.js builds three auth configs

## What

`createSignOutRegistry` reads its cutoff map from `sharedCutoffStore()`, which
anchors a single `Map` to `globalThis` under `Symbol.for('@lets-park/auth:sign-out-cutoffs')`.

A module-level `Map` would be the obvious thing. It does not work, and it does
not work *quietly* — which is the reason this has a record of its own rather
than a comment.

## Why

The first implementation of `doc/decision/0230-*` held the cutoffs in the
closure of `createAuthConfig`. Every unit test passed. The end-to-end test —
sign in, keep the cookie, sign out, put the cookie back, expect to be refused —
failed, and the restored cookie worked exactly as before.

Temporary instrumentation in the running `next start` process said why:

```
[t33] createAuthConfig instance mffm19
[t33] createAuthConfig instance qu35nq
[t33] createAuthConfig instance w47ltk
[t33] jwt check revoked= false        ← ×16
[t33] signOut event mffm19 hasToken true sub string iat number
[t33] jwt check revoked= false        ← ×4, after the sign-out
```

**Three `createAuthConfig` instances in one process.** Next.js compiles the
proxy, the `/api/auth/*` route handlers and the server components into separate
bundles, each with its own module registry, so `createAuth()` in
`apps/web/src/auth.ts` runs once per bundle. The sign-out event reached exactly
one of them. Every authorization check that mattered — the proxy's, which is
what issues the redirect — ran against a different, permanently empty registry.

Sign-out looked revoked from the endpoint that performed it and was honoured
everywhere it counted. Nothing threw, nothing logged, and the only symptom was
the security property quietly not holding.

`globalThis` crosses the bundle boundary because all three run in the same V8
realm — which is true here *because* the proxy runs on the Node.js runtime
(`doc/decision/0100-*`). `Symbol.for` rather than `Symbol()` for the same
reason: the global symbol registry is realm-wide, so two copies of the module
resolve the same key, whereas `Symbol()` would mint a fresh one per copy and
reproduce the original bug in a subtler form.

The map is a parameter of `createSignOutRegistry`, not something it reaches for
itself: tests get a private map by default and stay isolated, while
`createAuthConfig` passes the shared one explicitly, so the global state is
visible at the call site instead of hidden in a module.

## Risk

- **Moving the proxy to the Edge runtime would silently stop this working.**
  Edge is a separate isolate with its own `globalThis`, so the proxy would go
  back to an empty registry and sign-out would stop being enforced on exactly
  the path that enforces it — with no error. `0100-*` already fixes the runtime
  for a different reason (secrets must not be inlined into an Edge bundle);
  this is a second, independent reason it cannot move.
  `config.spec.ts` › *revokes across configurations, not just the one that
  signed out* is what fails if the sharing is ever broken, and it fails for the
  per-configuration map specifically — verified by mutation.
- **Process-wide state is process-wide.** A second web instance would not see
  the first's sign-outs, which makes horizontal scaling of `apps/web` a change
  that must go through this file. `SignOutRegistry` is deliberately four methods
  wide so that moving it behind Redis or a table touches nothing else.
- **A restart empties it.** Stated in `0230-*` under Risk; repeated here because
  this is the file where it is true.
- **`globalThis` is shared with everything else in the process.** The symbol is
  namespaced to this package to make a collision implausible, but nothing
  enforces that; a second consumer of the same key would corrupt sign-out.
