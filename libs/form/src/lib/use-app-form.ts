import { useForm } from 'react-hook-form';
import type { FieldValues, Resolver, UseFormProps, UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';

/**
 * Options for {@link useAppForm}: every `UseFormProps` react-hook-form itself
 * accepts, minus `resolver` (which `useAppForm` always derives from
 * `schema`), plus the schema itself.
 *
 * `TSchema` is generic rather than fixed to a `libs/contract` schema — this
 * lib is domain-free and validates whatever Zod object schema a caller (in
 * `apps/web` or a future `type:feature` lib) passes in.
 */
export interface UseAppFormOptions<TSchema extends z.ZodType<FieldValues, FieldValues>>
  extends Omit<UseFormProps<z.input<TSchema>, unknown, z.output<TSchema>>, 'resolver'> {
  /** The single source of truth for this form's shape and validation rules. */
  readonly schema: TSchema;
}

/**
 * `UseFormReturn` typed from one Zod schema: field values are `z.input<TSchema>`
 * (what `register`/`Controller` read and write, before Zod's own transforms),
 * and `handleSubmit`'s callback receives `z.output<TSchema>` (after them) —
 * the same split react-hook-form itself makes between "field values" and
 * "transformed values".
 */
export type AppForm<TSchema extends z.ZodType<FieldValues, FieldValues>> = UseFormReturn<
  z.input<TSchema>,
  unknown,
  z.output<TSchema>
>;

/**
 * The one place `useForm` is called in the whole workspace.
 *
 * Wires a Zod schema into react-hook-form via `@hookform/resolvers/zod`, so
 * every form in the product validates against the same schema its submit
 * request will ultimately be checked against again by the contract
 * (`libs/contract`) — never a hand-duplicated set of validation rules.
 *
 * A typo in a field name passed to `register`/`control` elsewhere is a
 * compile error, because `TSchema` drives both the field-value type and the
 * submitted-value type; nothing here falls back to `any`.
 */
export function useAppForm<TSchema extends z.ZodType<FieldValues, FieldValues>>(
  options: UseAppFormOptions<TSchema>
): AppForm<TSchema> {
  const { schema, ...formOptions } = options;

  /**
   * The one narrow type assertion in this lib, confined to this single line.
   *
   * `zodResolver`'s own generics are inferred *from* its `schema` argument;
   * here `schema` is `TSchema`, a still-generic type parameter, not a
   * concrete schema. TypeScript can only resolve `z.input<TSchema>` /
   * `z.output<TSchema>` against `TSchema`'s *constraint*
   * (`z.ZodType<FieldValues, FieldValues>`), not its eventual instantiation —
   * so both the fully-inferred call and an explicitly-typed one collapse to
   * `Resolver<FieldValues, unknown, FieldValues>`, which does not structurally
   * match the caller-facing `Resolver<z.input<TSchema>, unknown,
   * z.output<TSchema>>` `useForm` below expects. This is a limitation of
   * wrapping one already-generic function inside another, not a real type
   * mismatch: at every call site `TSchema` is concrete, `zodResolver` runs
   * against the real schema exactly as `@hookform/resolvers/zod` documents,
   * and the assertion changes nothing about runtime behaviour. Every
   * *consumer-facing* type in this file (`UseAppFormOptions`, `AppForm`,
   * `useAppForm`'s signature) stays fully precise — this is the only place an
   * escape hatch was needed, and it is a `Resolver` cast, not `any`.
   */
  const resolver = zodResolver(schema) as unknown as Resolver<
    z.input<TSchema>,
    unknown,
    z.output<TSchema>
  >;

  return useForm<z.input<TSchema>, unknown, z.output<TSchema>>({
    ...formOptions,
    resolver,
  });
}
