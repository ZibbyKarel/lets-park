# 0037 – `libs/query`'s tests run on Node's fetch, not jsdom's, via a custom Jest environment

**Date:** 2026-09-02 · **Status:** accepted · **Task:** 19 (`libs/api-client`, `libs/query`)

## What

`libs/query` does not use Jest's stock `jsdom` environment. It uses
`libs/query/jest-environment-web.cjs`, a subclass of `jest-environment-jsdom` that replaces
one family of globals in the jsdom context with **Node's** implementations:

```
fetch, Request, Response, Headers, FormData, Blob, File,
ReadableStream, WritableStream, TransformStream,
TextEncoder, TextDecoder, structuredClone,
AbortController, AbortSignal
```

Scope is this one lib. `libs/i18n` and `libs/form` render components, touch no network, and
keep plain `jsdom`. `libs/api-client` runs on `testEnvironment: 'node'` and needs none of it.

## Why

**Why anything is needed at all.** `libs/query`'s tests drive a **real** `RPCLink` from
`@orpc/client` with only the bottom-most `fetch` stubbed — that is deliberate (see below) —
and jsdom 26 implements almost none of the fetch/stream family. Probed rather than assumed;
a test printing `name in globalThis` inside a stock jsdom environment reported:

```
PRESENT: Headers,FormData,Blob,File,AbortController
MISSING: fetch,Request,Response,ReadableStream,WritableStream,TransformStream,
         TextEncoder,TextDecoder,structuredClone
```

Without them, *importing* `@orpc/client` already fails:
`ReferenceError: TransformStream is not defined`, thrown from
`@orpc/standard-server/dist/index.mjs` at module scope.

**Why every name is replaced, not just the missing ones.** The first version of this file
filled in only the nine missing globals and left jsdom's `Headers`, `FormData`, `Blob`,
`File` and `AbortController` in place. It failed, at runtime, on every test that issued a
request:

```
TypeError: RequestInit: Expected signal ("AbortSignal {}") to be an instance of AbortSignal.
    at toFetchRequest (@orpc/standard-server-fetch/dist/index.mjs:272:10)
```

TanStack Query passes its own `AbortSignal` into the query function, that signal came from
jsdom's `AbortController`, and Node's `Request` constructor rejects a signal from a foreign
realm. The family is only usable as a set, so all fifteen names come from one realm.

**Why a Jest environment module and not `setupFiles`.** An environment module is loaded in
the **Node** realm, so `globalThis` inside it is Node's and the implementations are simply
there to hand over. By the time `setupFiles` runs, `globalThis` is jsdom's, and Node's
`fetch`/`Request`/`Response` are not reachable through any `require` — they are intrinsics,
not a module.

**Why Node's implementations rather than a polyfill dependency.** Node 22 already has all
fifteen. Adding `undici` (or `whatwg-fetch`) would mean a new dependency whose `Request` is a
*third* class, distinct from both jsdom's and Node's — reintroducing exactly the realm
mismatch documented above, at the boundary between the object a test constructs and the one
`@orpc/client` constructs.

**Why not just mock the client instead.** The alternative to all of this is to hand
`createApiQueryUtils` a hand-written fake `ApiClient` and skip the transport. That would make
the environment problem disappear and take the tests' entire subject with it: what
`libs/query`'s tests verify is that a **423 from this backend** is not retried, that a domain
code survives from the wire into a component, and that a query key round-trips through the
cache — none of which a fake client exercises, because the errors under test are produced by
the transport, not by the fake.

## How

```js
const JSDOMEnvironment = require('jest-environment-jsdom').default;

class WebApiJSDOMEnvironment extends JSDOMEnvironment {
  constructor(config, context) {
    super(config, context);
    for (const name of WEB_GLOBALS) {
      this.global[name] = globalThis[name];
    }
  }
}
```

Referenced from `libs/query/jest.config.cts` as
`testEnvironment: '<rootDir>/jest-environment-web.cjs'`. The constructor throws if the Node
runtime is missing any of the fifteen, rather than silently leaving jsdom's half-set in place
and letting the failure surface later as an unrelated-looking `TypeError`.

`.cjs`, not `.ts`: Jest loads the environment module before any transform is configured for
it, so it has to be directly requirable.

## Risk if this is wrong

The environment is one more thing that differs between `libs/query`'s tests and the browser
the code actually runs in. Concretely: these tests exercise **Node's** `fetch` semantics, not
the browser's, so a bug that only shows up in a browser's implementation (CORS handling, a
header the browser forbids setting) is invisible here. That is an acceptable trade for this
lib — nothing in `libs/query` is browser-fetch-specific, and the alternative loses the
transport entirely — but it is a reason not to copy this environment into a lib that tests
browser behaviour.

The second risk is that jsdom eventually implements these itself, at which point this file
would be overriding working implementations with Node's for no reason. It is small and its
whole reason for existing is written above; the signal to delete it is a jsdom release that
provides `fetch` and `Request`.
