# 0039 – A contract error is recognised by its code, not by oRPC's `defined` flag

**Date:** 2026-09-02 · **Status:** accepted · **Task:** 19 (`libs/api-client`)
**Follows on from:** `doc/decision/0018-*`, `doc/decision/0033-*`

## What

`libs/api-client` exposes one way to read a failure:

```ts
toContractError(error): ContractError | null   // { code, message, status, details }
errorStatus(error): number | undefined
```

`toContractError` recognises a domain error by parsing `error.code` through the contract's
own `errorCodeSchema`. It **does not** use `isDefinedError`, the helper `@orpc/client` ships
for exactly this purpose.

It returns `null` for three different situations — a transport failure, a response whose code
is outside `ERROR_CODES`, and a plain thrown value — because a caller can do nothing
different about any of them: none has localized copy keyed to a code, so all three are
"something went wrong".

## Why

**Why not `isDefinedError`.** It narrows on the runtime `defined` flag:

```ts
declare function isDefinedError<T>(error: T): error is Extract<T, ORPCError<any, any>>;
```

`apps/api`'s global filter sets `defined: false` on **every** domain error it serialises
(`contractErrorBody()` in `contract-exception.filter.ts`, `doc/decision/0033-*`), and does so
by construction: an error that reached the filter is by definition one the procedure did not
declare. So against this backend `isDefinedError` rejects every real domain error there is.
Using it would have looked correct and been wrong in production — the exact failure mode this
project has now paid for three times.

**Why parse the code rather than trust it.** `ERROR_CODES` is a closed enum
(`doc/decision/0016-*`) and the UI keys its Czech copy off it (`libs/i18n`). A code the
frontend has never heard of must not be presented as a contract error — the lookup would miss
and the user would see a raw string. `errorCodeSchema.safeParse` makes that structurally
impossible, and is also what makes the `null` branch honest.

**Why `ContractError` is a plain object rather than the `ORPCError` itself.** It is the shape
`libs/query` and every feature component read. Handing back oRPC's class would put an
`@orpc/client` type in the signature of the wrapper whose whole job is to keep that package
out of application code — the wrapper ban would still hold for imports, but the type would
leak through inference anyway.

**Why `details` is always present as a key.** `exactOptionalPropertyTypes` is on
workspace-wide, so `details?: ErrorDetails` and `details: ErrorDetails | undefined` are
different types. The always-present form is the one a caller can destructure without a guard.

**Why `errorStatus` exists separately.** `libs/query`'s retry policy has to distinguish "the
server refused this request" from "the request never arrived", and the second case has no
contract code at all — nor does a throttled request or an unmatched route, both of which keep
Nest's shape (`doc/decision/0033-*`). A status, with `undefined` meaning "no response", is the
smallest thing that expresses it.

## How

```ts
export function toContractError(error: unknown): ContractError | null {
  if (!(error instanceof ORPCError)) return null;
  const code = errorCodeSchema.safeParse(error.code);
  if (!code.success) return null;
  const details = errorDetailsSchema.safeParse(error.data);
  return {
    code: code.data,
    message: error.message,
    status: error.status,
    details: details.success ? details.data : undefined,
  };
}
```

Every test for this goes through a **real** `RPCLink` with a stubbed `fetch`, never a
hand-constructed `ORPCError` — including `does not narrow on oRPC's 'defined' flag`, which
exists to fail if someone "simplifies" this to `isDefinedError`, and a sweep over all twelve
`ERROR_CODES`.

## An unguarded defect in `apps/api` that this decision does not fix

`apps/api`'s filter writes its body at the top level (`response.status(s).json(body)`), but
the RPC protocol reads the payload out of a `{ json, meta }` envelope. A top-level body
deserialises to `undefined`, fails oRPC's `isORPCErrorJson`, and the client synthesises a code
from the HTTP status instead — so a 409 `SPOT_ALREADY_RESERVED` arrives as `CONFLICT`, which
is *also* a member of `ERROR_CODES` and therefore does **not** fail closed: the UI would show
the wrong domain error, confidently. Reproduced against a real `RPCLink` with
`@orpc/client@1.15.0`, and independently by the Task 19 reviewer.

**No test is watching for this.** An earlier version of this record claimed the test
`libs/api-client/src/lib/errors.spec.ts` → `loses the domain code when a body is not wrapped
in the RPC envelope` acted as a tripwire that would fail once the server was fixed. That was
wrong, and it is worth stating why rather than quietly deleting it: that test hand-writes its
own unwrapped body and restates the filter's body builder locally, so it has **zero coupling
to `apps/api`** and will keep passing unchanged forever, fixed server or not. It documents a
property of `@orpc/client` — which is genuinely useful and is why it is kept — and nothing
about the server.

The coupling cannot be added from `libs/api-client`: it is `type:util`/`scope:web`, `apps/api`
is `type:app`/`scope:api`, and the Nx boundaries forbid a lib depending on an app *and* web
reaching api. **The guard that would work belongs in `apps/api`'s filter spec, asserting the
serialised body is enveloped — a test that fails today.** Writing it was outside Task 19's
file set; it is routed to whoever owns `apps/api` next.

Fixing the defect itself belongs there too, and it may resolve itself: an oRPC `RPCHandler`
serialises its own responses, so the filter's hand-built body would never be what is on the
wire. Until either happens, treat this as **known, reproduced, and unguarded**.

## Risk if this is wrong

**Do not "fix" the mismatch by loosening `toContractError` to read a top-level body.** That
would make the client accept a shape the protocol does not define, and the two sides would
drift apart with nothing failing — the same class of problem as the phantom tripwire above,
one layer down.

The narrower risk in this module is the `null` return collapsing three situations into one. If
a future requirement needs to distinguish "offline" from "unknown code" (say, to offer a
retry button only for the first), that is a new return shape, not a widening of
`ContractError` — a `code` field that might not be a member of `ERROR_CODES` would put the
`libs/i18n` copy lookup back where this decision took it out of.
