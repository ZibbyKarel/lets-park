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

## Risk if this is wrong

There is a **live mismatch this decision does not fix**, found by probing a real link and
pinned by the test `cannot read a domain code from a body that is not wrapped in the RPC
envelope`:

`apps/api`'s filter writes its body at the top level (`response.status(s).json(body)`), but
the RPC protocol reads the payload out of a `{ json, meta }` envelope. A top-level body
deserialises to `undefined`, fails oRPC's `isORPCErrorJson`, and the client synthesises a code
from the HTTP status instead — so a 409 `SPOT_ALREADY_RESERVED` arrives as `CONFLICT`, which
is *also* a member of `ERROR_CODES` and therefore does not fail closed: the UI would show the
wrong domain error, confidently.

Fixing that belongs to whoever mounts the oRPC handler in `apps/api`, and it may resolve
itself — an oRPC `RPCHandler` serialises its own responses, and the filter's hand-built body
would then never be what is on the wire. Until then the test pins the broken behaviour, so the
day the envelope appears the test fails loudly and is deleted. **Do not "fix" that test by
loosening `toContractError` to read a top-level body**: that would make the client accept a
shape the protocol does not define, and the two sides would drift apart with nothing failing.
