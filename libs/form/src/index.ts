/**
 * `@lets-park/form` — the only place in the workspace allowed to import
 * `react-hook-form` (enforced in `eslint.config.mjs`, see `doc/wrappery.md`).
 *
 * The bridge between `libs/contract`'s Zod schemas and the design system's
 * input primitives (`Input`, `Select`, `Checkbox`, ...):
 *
 * - `useAppForm` — wires a Zod schema into react-hook-form via
 *   `@hookform/resolvers/zod`.
 * - `FormProvider` — supplies the resulting form as context to the tree
 *   below it.
 * - `FormField` — connects one field's value and Zod error message to one
 *   primitive, without the primitive ever seeing react-hook-form itself.
 *
 * Deliberately narrow: this is the whole API. See `doc/wrappery.md` for why.
 */
export * from './lib/use-app-form';
export * from './lib/form-field';
export * from './lib/form-provider';

/**
 * Re-exported so a consumer already inside a `FormProvider` tree can type its
 * own props (a `name`, a submit handler, a field-value shape) without a
 * second, direct `react-hook-form` import — this lib stays the only allowed
 * import site for the package itself.
 */
export type {
  Control,
  ControllerRenderProps,
  FieldPath,
  FieldValues,
  SubmitHandler,
} from 'react-hook-form';
