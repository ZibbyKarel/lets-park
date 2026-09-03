import { CAR_COLOR_PALETTE } from './car-palette';
import {
  BRAND_COLORS,
  FOREGROUND_COLORS,
  LINE_COLORS,
  NEUTRAL_COLORS,
  STATUS_COLORS,
  SURFACE_COLORS,
} from './colors';
import { SCRIM } from './overlays';

/**
 * Every colour `assets/theme.css` maps into Tailwind's `--color-*` namespace,
 * keyed by the name that appears in a utility (`bg-brand-blue`, `text-fg-2`,
 * `bg-scrim`, `text-car-1`) and valued with the CSS colour it resolves to.
 *
 * **Derived, so it cannot fall behind.** Two specs used to carry a
 * hand-maintained list of colour names, and both were incomplete in the same
 * way: `scrim` and the `neutral-*` steps were missing, so a rule written with
 * `bg-scrim` or `text-neutral-600` was simply invisible to them.
 * `theme-css.spec.ts` now asserts this map and `theme.css`'s `--color-*` block
 * are the same set, in both directions, so a colour cannot exist in one and
 * not the other.
 *
 * Values are hex except `scrim`, which is `rgba(...)` by design — it is a sheet
 * you see through, not a surface anything is drawn on.
 */
export const COLOR_UTILITIES: Record<string, string> = (() => {
  const kebab = (key: string) =>
    key
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/([a-z])(\d)/g, '$1-$2')
      .toLowerCase();
  const named = (
    group: Record<string, string | number>,
    name: (key: string) => string
  ): [string, string][] => Object.entries(group).map(([key, value]) => [name(key), String(value)]);

  return Object.fromEntries([
    // `text` is the odd one out: it is the only brand colour whose utility name
    // is not prefixed, because `colors_and_type.css` calls it `--text`.
    ...named(BRAND_COLORS, (key) => (key === 'text' ? 'text' : `brand-${kebab(key)}`)),
    ...named(NEUTRAL_COLORS, (key) => `neutral-${key}`),
    ...named(SURFACE_COLORS, kebab),
    // `onGreen` → `fg-on-green`; `fg2` → `fg-2`.
    ...named(FOREGROUND_COLORS, (key) => (key.startsWith('on') ? `fg-${kebab(key)}` : kebab(key))),
    ...named(LINE_COLORS, kebab),
    ...named(STATUS_COLORS, kebab),
    ['scrim', SCRIM] as [string, string],
    ...CAR_COLOR_PALETTE.map((value, index): [string, string] => [`car-${index + 1}`, value]),
  ]);
})();

/** Just the names, for callers that only need to recognise a colour utility. */
export const COLOR_UTILITY_NAMES: readonly string[] = Object.keys(COLOR_UTILITIES);
