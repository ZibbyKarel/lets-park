# 0007 – ESLint boundaries: the `ds:*` tag dimension and external contract imports

**Date:** 2026-08-28 · **Status:** accepted

## What

Two deviations from the literal wording of the Task 1 brief in the
`@nx/enforce-module-boundaries` configuration (`eslint.config.mjs`):

1. Alongside the `type:*` and `scope:*` dimensions there is a third dimension,
   **`ds:tokens` / `ds:primitives` / `ds:compounds`**, for the design-system layers.
2. `type:contract` has `allowedExternalImports: ['zod', 'zod/*', '@orpc/contract',
   'tslib']` – i.e. not just `zod`.

## Why

**1) The `ds:*` dimension.** The brief requires that `libs/shared/design-system/primitives`
must not import `libs/shared/design-system/compounds`. But both libs are `type:ui`, and the
rule `type:ui → [type:ui, type:util]` cannot distinguish between them. Nx evaluates
every rule whose `sourceTag` matches **conjunctively** – adding a second tag therefore
creates an additional condition the target must satisfy:

| source | may depend on |
| --- | --- |
| `ds:tokens` | `type:util` |
| `ds:primitives` | `ds:tokens`, `type:util` |
| `ds:compounds` | `ds:tokens`, `ds:primitives`, `type:util` |

`primitives → compounds` passes the `type:ui` rule but fails the `ds:primitives`
rule, because `compounds` carries neither `ds:tokens` nor `type:util`. The direction
tokens → primitives → compounds is thereby enforced one-way, exactly as `plan.md`
requires.

**2) `@orpc/contract` in the contract lib.** The Task 1 brief says "`type:contract`
must not import anything besides `zod` and `type:util`", but `plan.md` (Phase 1)
places the **oRPC contract** in that same lib – procedures are defined there via
`@orpc/contract`. The literal rule would make Phase 1 impossible to write. Only
`@orpc/contract` (contract definitions) is allowed, not `@orpc/server` or
`@orpc/client` – those belong to the backend and to `libs/shared/api-client` respectively.
`tslib` is a TypeScript runtime helper (`importHelpers: true`), not a dependency in
the domain sense.

## How

- The configuration lives in `eslint.config.mjs`, in the
  `@nx/enforce-module-boundaries` section.
- Tags for future libs are listed in `doc/workspace.md` (the "how to add a new lib"
  table).
- Verified with temporary libs: ESLint rejects both `primitives → compounds` and
  `scope:api → scope:web` (see the Task 1 report).

## Risk if this is wrong

If splitting the design system into three libs turns out to be unnecessary, the
`ds:*` tags get deleted along with the libs – they're not used anywhere else. If the
contract needs another package (e.g. a different oRPC module), extending
`allowedExternalImports` is a one-line change; the worse outcome would be if nobody
maintained the list and the rule got disabled entirely – that's why it's scoped to
specific packages, not to `@orpc/*`.
