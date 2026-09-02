# Wrapper layers

Founded by Task 18 (`libs/form`), the first of a run of Tasks 18–22 that progressively
establishes the rest of `WRAPPED_LIBRARIES`. Task 19 added `libs/api-client` and
`libs/query`; `libs/realtime-client` and `libs/auth` are still to come. Each wrapper adds its
own section here, not a new file.

## What a wrapper lib is and why it's mandatory

`plan.md` and `doc/workspace.md` (the "Wrapper layers" section) forbid application and
library code from importing certain third parties directly. For each of them there is
exactly one **wrapper lib** — the single place in the whole workspace allowed to import it:

| forbidden package | wrapper lib | tag |
| --- | --- | --- |
| `react-hook-form` | `libs/form` (done, Task 18) | `type:util`, `scope:web` |
| `@tanstack/react-table` | `libs/design-system/compounds` | `type:ui`, `scope:web`, `ds:compounds` |
| `@tanstack/react-query` | `libs/query` (done, Task 19) | `type:util`, `scope:web` |
| `@orpc/client` | `libs/api-client` (done, Task 19) | `type:util`, `scope:web` |
| `socket.io-client` | `libs/realtime-client` | `type:util`, `scope:web` |
| `next-auth` | `libs/auth` | `type:util`, `scope:web` |
| `ical-generator` | `libs/calendar-export` | `type:util`, `scope:api` |
| `next-intl` | `libs/i18n` (done, Task 17) | `type:util`, `scope:web` |

The reason for the ban isn't "save a few characters of import" but three concrete things a
direct import anywhere else would break:

1. **The third party's version and behavior stay swappable in exactly one place.** If
   `apps/web` called `react-hook-form` directly in ten places, a major-version upgrade or a
   swap for a different library (`libs/form` internally uses `@hookform/resolvers`) would
   mean ten places to fix instead of one.
2. **The contract remains the single source of truth for the shape of the data.** The
   wrapper is the bridge between the Zod schema (`libs/contract`) and the rest of the stack —
   `libs/form` takes a Zod schema and validates against it, `libs/api-client` will take the
   oRPC contract. A direct import of the library would bypass that bridge and open the door
   to hand-written validation that drifts from the contract over time.
3. **The boundary can be enforced mechanically, not just by review.** `eslint.config.mjs`
   (`no-restricted-imports` + `@nx/enforce-module-boundaries`) checks it on every
   `npm run lint` run (`--max-warnings=0`) — a reviewer doesn't have to remember the rule,
   the build fails instead.

## How the ban is enforced

One map, `WRAPPED_LIBRARIES` in `eslint.config.mjs`, is the single source of truth for the
pair (forbidden package → owning directory). It generates:

- the **global ban** (`no-restricted-imports` on `apps/**` and `libs/**`) — one pattern per
  package from the map, with an error message that names the wrapper to use instead;
- the **owner's exception** (`wrapperLibOverrides`) — the same rule, but with the owner's
  package subtracted from the forbidden list, applied only to `<owner>/**`.

This one map is also why `doc/workspace.md` warns about "silently does nothing": both rules
(the ban and the exception) draw from the same data, so they can't drift apart, but
**`basePath: workspaceRoot`** is still required on both — Nx runs `eslint .` with cwd set to
the project's directory, so a workspace-relative glob (`libs/form/**`) without `basePath`
compares against the wrong path and never matches.

Besides banning the package import, wrapper libs also carry the Nx `type:util` dimension,
whose `allowedExternalImports` is the union of every package in `WRAPPED_LIBRARIES` plus
their React/Next peer dependencies (`doc/workspace.md`) — **exactly who is allowed to import
whom** (that `libs/form` may import only `react-hook-form`, not `next-auth`) is guarded only
by the `no-restricted-imports` override, because the Nx dimension alone can't make that
distinction (every wrapper lib carries the same tag at once).

### `libs/form` and the design system — why this isn't another exception in the same map

`libs/form` is unusual in one respect: `FormField` has to "connect" a Zod error and a
design-system primitive (`Input`/`Select`/`Checkbox`), but it **does not import the design
system** in its production code — it does this as a generic render prop
(`doc/decision/0030-*`). Composing it with a concrete primitive is left to the caller
(the future `apps/web`), the same way as any other design-system composition. The only
place where `libs/form` needs the design system at all is its own demonstration test
(`app-form.spec.tsx`) — and that has its own narrowly targeted ESLint override
(`doc/decision/0030-*`), not an extension of `WRAPPED_LIBRARIES`.

### Usage example

`FormField` is a generic render prop (see above) — it connects one field's value, `onChange`,
`onBlur`, `ref`, and the resolved Zod error to whatever primitive the caller picks. For
`Input` and `Select`, spreading `{...field}` directly is enough, because their
`value`/`onChange` match what react-hook-form sends. **`Checkbox` does not** — it's a native
`<input type="checkbox">`, which carries its state through `checked` (a boolean), not
`value`, and whose `onChange` sends an event whose `target.checked` (not `target.value`)
needs to be sent back into `field.onChange`. This is exactly where the render-prop design
hands responsibility to the caller — and exactly what's easiest to forget when writing a new
domain form:

```tsx
import * as z from 'zod';
import { Checkbox, Input, Select } from '@lets-park/design-system-primitives';
import { FormField, FormProvider, useAppForm } from '@lets-park/form';

const bookingSchema = z.object({
  spotId: z.string().min(1, 'Choose a spot'),
  vehicleType: z.enum(['car', 'motorcycle']),
  recurring: z.boolean(),
});

function BookingForm() {
  const form = useAppForm({
    schema: bookingSchema,
    defaultValues: { spotId: '', vehicleType: 'car', recurring: false },
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit((values) => submitBooking(values))}>
        {/* Input/Select: field shape already matches value/onChange, spread directly. */}
        <FormField
          name="spotId"
          render={({ field, error }) => <Input label="Parking spot" error={error} {...field} />}
        />
        <FormField
          name="vehicleType"
          render={({ field, error }) => (
            <Select label="Vehicle" error={error} {...field}>
              <option value="car">Car</option>
              <option value="motorcycle">Motorcycle</option>
            </Select>
          )}
        />

        {/* Checkbox adapter: checked (not value), and onChange must read
            event.target.checked back into field.onChange — a plain
            {...field} spread here would silently do nothing on click. */}
        <FormField
          name="recurring"
          render={({ field, error }) => (
            <Checkbox
              label="Repeat this reservation weekly"
              error={error}
              name={field.name}
              checked={field.value}
              onChange={(event) => field.onChange(event.target.checked)}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />

        <button type="submit">Reserve</button>
      </form>
    </FormProvider>
  );
}
```

The same pattern (with tests over `Checkbox` too) is verified in
`libs/form/src/lib/app-form.spec.tsx` — this example is drawn directly from it, just with the
parking domain instead of the generic demo schema.

## How to add another wrapper lib (Tasks 20–22)

1. **Generate the lib** the same way as any other (`doc/workspace.md`, "How to add a new
   lib"). Tags: `type:util`, `scope:web` (or `scope:api` for `libs/calendar-export`).
2. **Add an entry to `WRAPPED_LIBRARIES`** in `eslint.config.mjs` — `owner` (the lib's
   directory) and `use` (the import path). The global ban and the exception for the new
   wrapper are generated automatically, nothing else needs to be written.
3. **If the package needs its own helper dependency** (like `@hookform/resolvers` for
   `react-hook-form`), add it separately to `NPM_ALLOWLIST.util` — it isn't part of
   `WRAPPED_LIBRARIES`, because it doesn't stand in for anyone by itself, and only makes
   sense paired with the wrapped package.
4. **Write three kinds of tests** (as Task 17 did for `next-intl` and Task 18 for
   `react-hook-form`):
   - that the wrapper can actually be used (render/call through its public API),
   - that it behaves according to the contract/data it wraps (validation, formatting, ...),
   - that application code **doesn't need to** import the wrapped library directly to use
     the wrapper — not just that the export exists, but a real, running example.
5. **Verify both the ban and the exception with temporary probe files**, not just that
   `npm run lint` passes green (`doc/workspace.md` — this trap has already happened three
   times): one import of the wrapped package inside the new lib (expected: passes), the same
   import from somewhere else (expected: fails with a message that names the correct
   wrapper). Delete the probe files once verified.
6. `npm run lint && npm run typecheck && npm run test` + `npm run build`, add a section
   here.

## `libs/form` tests

| file | what it verifies |
| --- | --- |
| `use-app-form.spec.tsx` | `useAppForm` + `FormField` on a bare `<input>`: a Zod error propagates into `role="alert"` and `aria-invalid`; a valid submit calls the handler with the values after Zod parsing |
| `app-form.spec.tsx` | the same, on real `Input`/`Select`/`Checkbox` from `@lets-park/design-system-primitives` — three fields, three different primitives, one Zod schema; plus a test that reads its own source file and verifies there is no direct import of `react-hook-form` in it |

Zod in the tests is always a local `z.object(...)` schema, not an import from
`@lets-park/contract` — `libs/form` is domain-independent, and `@orpc/contract` (ESM-only,
see `doc/decision/0020-*`) would add a transform to its Jest config that this task doesn't
need. So there is no fourth copy of the ESM-transform block (`doc/decision/0020-*`, `0025-*`)
in `libs/form/jest.config.cts`, nor was one needed.

---

## `libs/api-client` — the oRPC client (Task 19)

`@lets-park/api-client` is the only place in the workspace allowed to import `@orpc/client`.
It exports exactly two things, plus their types:

```ts
import { createApiClient, toContractError } from '@lets-park/api-client';

const api = createApiClient({
  url: 'https://example.test/rpc',
  getAccessToken: () => session?.accessToken,   // libs/auth, Task 20
});

const overview = await api.overview.day({ date: '2026-09-15' });
```

`ApiClient` is `ContractClient` — **derived from `libs/contract`**, not written out. Every
procedure, input, output and declared error code is regenerated from the Zod schemas on each
build, so it cannot drift from the backend the way a hand-written client would, and no
endpoint that the contract does not declare can be called at all.

The `ContractRouterClient<Contract>` application lives in `libs/contract` rather than here, so
that `@orpc/contract` stays allow-listed for `type:contract` alone. `NPM_ALLOWLIST` hangs off
the `type:` tag, which is shared by every wrapper lib, so granting it to `libs/api-client`
would have granted it to `libs/form` and `libs/i18n` too — see `doc/decision/0040-*`.

### The access token is a provider, not a string

`getAccessToken` is a function (sync or async) and is called **per request**, so a token
refreshed after the client was constructed is picked up. Returning `null`, `undefined` or
`''` omits the `Authorization` header entirely rather than sending `Bearer undefined` —
covered by four cases in `api-client.spec.ts`. `libs/auth` (Task 20) supplies the real
implementation; until then any caller can inject one.

### Reading errors

```ts
const error = toContractError(caught);        // ContractError | null
if (error?.code === 'SPOT_ALREADY_RESERVED') { … }
```

`toContractError` recognises a domain error by its **code**, parsed through the contract's
`errorCodeSchema` — deliberately **not** by oRPC's `isDefinedError`, which narrows on the
`defined` flag that `apps/api` sets to `false` on every domain error it serialises. Using it
would reject every real domain error this backend produces. Full reasoning:
`doc/decision/0039-*`.

> **Known, reproduced and unguarded:** `apps/api`'s filter writes its error body at the top
> level, but the RPC protocol reads it out of a `{ json, meta }` envelope — so a 409
> `SPOT_ALREADY_RESERVED` currently arrives as `CONFLICT`, which is also a member of
> `ERROR_CODES` and therefore does *not* fail closed. **No test watches for this**; the guard
> that would work belongs in `apps/api`'s filter spec and does not exist yet.
> `doc/decision/0039-*` states the situation and why `libs/api-client` cannot guard it.

`null` means "not a domain error" and covers a transport failure, an unknown code, and a plain
thrown value alike — none of them has localized copy keyed to a code, so all three are
"something went wrong". `errorStatus(error)` gives the HTTP status, or `undefined` when the
request never reached a server; that distinction is the entire input to `libs/query`'s retry
policy.

## `libs/query` — TanStack Query (Task 19)

`@lets-park/query` is the only place allowed to import `@tanstack/react-query`. It re-exports
the hooks, so a feature component never needs a second import path:

```tsx
import { createApiQueryUtils, useQuery, useMutation, useQueryClient } from '@lets-park/query';
import { toContractError } from '@lets-park/api-client';

const utils = createApiQueryUtils(api);        // once, at the app root

function DayOverview() {
  const { data, error } = useQuery(utils.overview.day.queryOptions({ input: { date } }));
  if (error) return <Alert code={toContractError(error)?.code} />;
  return <SpotGrid spots={data.spots} />;
}
```

**Query keys are never written by hand.** `createApiQueryUtils` (built on
`@orpc/tanstack-query`) mirrors the contract router, so each leaf carries `queryKey`,
`queryOptions`, `mutationOptions` and `call`, and each branch carries `key()` for partial
matching. Invalidating "everything about the day overview" is
`invalidateQueries({ queryKey: utils.overview.key() })` — which is exactly what keeps a cache
entry from being missed because someone spelled its key differently.

### The client and the provider

```tsx
const queryClient = createQueryClient();       // one per request (SSR) / per session
<QueryProvider client={queryClient}>{children}</QueryProvider>
```

`QueryProvider` takes the client as a **required prop** rather than creating it: a client
created in a component body is re-created on every render, throwing the cache away, and
Next.js needs one instance per request on the server and one per session in the browser.
Deciding that is the app's job.

`createQueryClient` is the **only** way to get a client. `@lets-park/query` exports
`QueryClient` as a *type* only, so `new QueryClient()` is a compile error rather than a
convention — otherwise app code could construct a client carrying TanStack's defaults (three
retries on everything, including the 4xx domain errors that are decisions rather than
hiccups) while still passing the ESLint wrapper ban, since the class would have come from the
wrapper.

`createQueryClient` carries the project's policy — `staleTime` 30 s, `gcTime` 5 min,
`refetchOnWindowFocus: false` (realtime invalidation arrives over Socket.io in Task 21, so
refetching on focus is redundant traffic), `retry: shouldRetryQuery`, and **mutations are not
retried**. Overrides merge one level deep, so a caller changing one option cannot silently
drop the rest.

### The retry policy

A **4xx is never retried**; everything else is retried up to `MAX_QUERY_RETRIES` (2). The
split is by HTTP status rather than by contract code, because it has to cover failures that
carry no code at all — a throttled request and an unmatched route keep Nest's shape
(`doc/decision/0033-*`). A rejected reservation or a closed window is a *decision*: repeating
it produces the same answer three times, delays the error the user needs to see, and spends
three requests against the throttler. A 5xx and a dropped connection are the transient cases
retries exist for.

Mutations are not retried because every mutation in this contract writes something a person
did on purpose; a silent second attempt after an ambiguous failure risks a duplicate write,
and the unique constraints that prevent double-booking would turn the retry into a *different*
error than the original.

### Tests

| file | what it verifies |
| --- | --- |
| `api-client/src/lib/api-client.spec.ts` | the URL, method and payload a contract procedure puts on the wire; nested admin paths; the `Authorization` header across five provider cases including per-request re-reads |
| `api-client/src/lib/errors.spec.ts` | a domain error maps onto its contract code/status/details; a sweep over all twelve `ERROR_CODES`; `null` for an unknown code, a throttled 429 and a network failure; the `defined: false` case that `isDefinedError` would reject; and one test documenting oRPC's own envelope behaviour (which is *not* a guard on `apps/api` — see the note above) |
| `query/src/lib/query-client.spec.ts` | the shipped defaults, override merging, and the retry policy counted in **requests that reached the transport** — one attempt for each of the twelve codes and for a 429, three for a 5xx and for an unreachable server |
| `query/src/lib/api-query.spec.ts` | key stability (same input, across two util trees), key distinctness, and that a branch key really invalidates its leaves through the cache's own matcher |
| `query/src/lib/app-usage.spec.tsx` | a real component reading, mutating and invalidating through the wrappers only — plus a test reading its own source to prove neither `@tanstack/*` nor `@orpc/*` was imported to do it |

Every one of these drives a **real** `RPCLink` with only the bottom-most `fetch` stubbed. A
hand-written fake client would skip the transport, which is precisely where the errors under
test are produced. That choice is what forces the custom Jest environment in
`libs/query/jest-environment-web.cjs` (jsdom implements no `fetch`; `doc/decision/0037-*`) and
the `module` setting in `libs/query/tsconfig.spec.json` (`doc/decision/0038-*`).

### One allow-list addition, and one deliberately refused

`NPM_ALLOWLIST.util` in `eslint.config.mjs` gained exactly one entry: `@orpc/tanstack-query`,
the bridge `libs/query` is built on. It does not belong in `WRAPPED_LIBRARIES` for the same
reason `@hookform/resolvers` doesn't — nothing could be imported *instead* of it, it only
makes sense paired with a package that is already wrapped.

`@orpc/contract` was **not** added, although `libs/api-client` needs `ContractRouterClient`.
`NPM_ALLOWLIST` hangs off the `type:` tag, which every wrapper lib shares, so the entry would
have handed the contract builder to `libs/form`, `libs/i18n` and every wrapper still to come —
undoing the narrowness `NPM_ALLOWLIST.contract` is documented to have (`doc/decision/0007-*`).
`libs/contract` applies the generic and exports `ContractClient` instead: `doc/decision/0040-*`.
