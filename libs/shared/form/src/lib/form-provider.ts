/**
 * Re-exported, not wrapped: react-hook-form's own `FormProvider` already does
 * exactly what this lib needs — spread the `AppForm` object returned by
 * `useAppForm` onto context, so `FormField` (via `useController`) and any
 * other descendant can reach it without threading `control` through props by
 * hand. Wrapping it would only rename it.
 *
 * This re-export exists so app/feature code never has its own, direct
 * `react-hook-form` import for this symbol — `libs/shared/form` stays the only
 * import site (`doc/wrappers.md`).
 */
export { FormProvider } from 'react-hook-form';
export type { FormProviderProps } from 'react-hook-form';
