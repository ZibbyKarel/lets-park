import type { SpacingKey } from '@lets-park/design-system/tokens';

/**
 * Every `gap-{step}` Tailwind class, spelled out as a literal — same
 * rationale as `PADDING_CLASSES` in `padding.ts`: Tailwind v4 finds classes
 * by scanning source text statically, so a template like `` `gap-${step}` ``
 * never appears verbatim in any file and Tailwind emits nothing for it.
 *
 * Unlike `Padding`, `gap` has no documented `0` use case in the spec's
 * evidence table (`flex flex-col gap-*` / `flex items-center gap-*`, always
 * with a real step) — so this map is keyed on `SpacingKey` alone, not
 * `SpacingKey | 0`. A caller that wants no gap simply omits the prop.
 *
 * Exported (only) so `gap.spec.ts` can walk every entry and assert it against
 * `` `gap-${step}` `` — a hand-typed table this size is the likeliest place
 * for a wrong *value* behind a correct key, which nothing else here would
 * catch.
 */
export const GAP_CLASSES: Record<SpacingKey, string> = {
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  5: 'gap-5',
  6: 'gap-6',
  8: 'gap-8',
  10: 'gap-10',
  12: 'gap-12',
  16: 'gap-16',
  20: 'gap-20',
  24: 'gap-24',
  32: 'gap-32',
};

/** Resolves a spacing step to its `gap-*` Tailwind class. */
export function resolveGap(step: SpacingKey): string {
  return GAP_CLASSES[step];
}
