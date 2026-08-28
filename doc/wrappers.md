# Wrapper layers

Task 18 from `doc/implementation-plan.md` (`libs/form`), the first of a run of Tasks 18–22
that progressively establishes the rest of `WRAPPED_LIBRARIES` (`libs/query`,
`libs/api-client`, `libs/realtime-client`, `libs/auth`). This document is founded now and
**gets extended by the later tasks** — each wrapper adds its own section here, not a new
file.

## What a wrapper lib is and why it's mandatory

`plan.md` and `doc/workspace.md` (the "Wrapper layers" section) forbid application and
library code from importing certain third parties directly. For each of them there is
exactly one **wrapper lib** — the single place in the whole workspace allowed to import it:

| forbidden package | wrapper lib | tag |
| --- | --- | --- |
| `react-hook-form` | `libs/form` (`@lets-park/form`) | `type:util`, `scope:web` |
| `@tanstack/react-table` | `libs/design-system/compounds` | `type:ui`, `scope:web`, `ds:compounds` |
| `@tanstack/react-query` | `libs/query` | `type:util`, `scope:web` |
| `@orpc/client` | `libs/api-client` | `type:util`, `scope:web` |
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

## How to add another wrapper lib (Tasks 19–22)

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
