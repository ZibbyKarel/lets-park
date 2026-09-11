# 0031 – `useAppForm` is parameterized by `TIn`/`TOut`, not by `TSchema` — no cast

**Date:** 2026-08-28 · **Status:** accepted (revised after Task 18 code review) · **Task:** 18
(`libs/shared/form`)

## What

`useAppForm` (`libs/shared/form/src/lib/use-app-form.ts`) calls `zodResolver(schema)` and passes its
result to `useForm` **with no cast**. The original revision was generic over `TSchema
extends z.ZodType<FieldValues, FieldValues>` and cast the `zodResolver` result through
`unknown`; Task 18's review showed the cast could be removed by changing what `useAppForm` is
parameterized over — this record replaces the original one, which claimed the cast was
necessary. It wasn't.

## Why (what didn't work, and why)

`zodResolver` from `@hookform/resolvers/zod` is itself generic: `zodResolver<Input, Context,
Output, T extends Zod4Type<Output, Input> = Zod4Type<Output, Input>>(schema: T, …):
Resolver<z4.input<T>, Context, z4.output<T>>` — TypeScript infers `T` (and hence
`Input`/`Output`) **from the static type of the `schema` argument**.

- In the `useAppForm<TSchema extends z.ZodType<FieldValues, FieldValues>>` version, `schema`
  had type `TSchema` — i.e. the bare, not-yet-substituted type parameter itself. When
  TypeScript infers `T` from an argument whose type is a bare type parameter, it can only
  compare `T` against `TSchema`'s **constraint**, i.e. `z.ZodType<FieldValues,
  FieldValues>` — not against whatever `TSchema` turns out to be at a given call site. The
  result therefore always narrowed to `Resolver<FieldValues, unknown, FieldValues>`, which
  didn't structurally match the `Resolver<z.input<TSchema>, unknown, z.output<TSchema>>`
  that `useForm` expected below it — hence the cast.
- The fix: `useAppForm` is parameterized directly over `TIn extends FieldValues`, `TOut
  extends FieldValues = TIn` (the shapes of the field values and the submitted values), and
  `schema` has type `z.ZodType<TOut, TIn>` — i.e. an **application** of `TIn`/`TOut` to
  `z.ZodType`, not a bare type parameter. In this form, TypeScript can infer `TOut`/`TIn`
  from the argument — the same way `function unwrap<A>(x: Box<A>): A` can infer `A` from
  `Box<A>` even though `A` is still generic. `zodResolver(schema)` then returns exactly
  `Resolver<TIn, unknown, TOut>`, which is exactly what `useForm<TIn, unknown, TOut>` below
  expects — no cast needed.

Verified directly (`tsc --noEmit`, temporary probe files, since deleted): with a concrete
schema (`z.object({ name: z.string(), age: z.coerce.number() })`), `tsc` correctly accepts
`form.getValues('name'): string` and `values.age: number` in `handleSubmit`, correctly
rejects those same assignments with the types swapped, and rejects a typo in a field name
(`getValues('nam')`) — so type precision matches the previous (cast) version exactly, just
without the cast.

## How

- `UseAppFormOptions<TIn, TOut = TIn>`, `AppForm<TIn, TOut = TIn>`, `useAppForm<TIn, TOut =
  TIn>` — all three generic over the shape of the data, not over the schema's type.
- `schema: z.ZodType<TOut, TIn>` — Zod v4's `ZodType<Output, Input>` (in this order), see
  `node_modules/zod/v4/classic/schemas.d.ts`.
- No `as`/`as unknown as` in `use-app-form.ts`; `FormField` and `FormProvider` were already
  cast-free before this.

## Risk if this is wrong

Nothing new beyond ordinary generic-writing risk: if a future version of
`@hookform/resolvers` changes the shape of `Zod4Type`/`Resolver` such that `TOut`/`TIn` can
no longer be inferred from `z.ZodType<TOut, TIn>`, `tsc` — unlike with the earlier cast —
will **report it directly as an error at the call site** (no silently-passed cast). That's
exactly why this version is better, not just differently written. Runtime behavior is
further covered by `use-app-form.spec.tsx` and `app-form.spec.tsx`.
