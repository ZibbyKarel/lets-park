import nx from '@nx/eslint-plugin';
import baseConfig, { restrictWrappedLibraries } from '../../../eslint.config.mjs';

/**
 * Packages the compounds layer must not reach for, even though `type:ui`
 * allows them workspace-wide.
 *
 * Same closed-layer rule as `libs/design-system/primitives/eslint.config.mjs`:
 * the design system installs no class-name helper, because `cx` from
 * `@lets-park/design-system/primitives` is three lines and already there.
 * `NPM_ALLOWLIST.ui` in the root config cannot express this — it is one list
 * shared by all three `ds:*` layers.
 *
 * This is **not** expressed as `allowedExternalImports` on the `ds:compounds`
 * tag, because that does not work: Nx does not intersect
 * `allowedExternalImports` across tag dimensions, so one matching constraint
 * that permits the package is enough and a second, tighter list never narrows
 * anything. That was probed with `clsx` at Task 8's merge and is recorded both
 * beside the `ds:*` entries in the root config and in the primitives config
 * next door.
 *
 * `@tanstack/react-table` is deliberately absent from this list: this lib is
 * its owner in `WRAPPED_LIBRARIES`, and `wrapperLibOverrides` in the root
 * config already unbans it here and nowhere else.
 *
 * Probe this rule before trusting it: add `import clsx from 'clsx'` to any file
 * here and run `npx nx lint design-system-compounds`. It must name `clsx` and
 * exit 1.
 */
const CLOSED_LAYER_BANS = [
  {
    group: ['clsx', 'clsx/*', 'classnames', 'tailwind-merge', 'class-variance-authority'],
    message:
      'The design system installs no class-name helper — use `cx` from `@lets-park/design-system/primitives`. See doc/decision/0052-overlay-tokens-and-one-layering-scale.md.',
  },
];

export default [
  ...nx.configs['flat/react'],
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      // `restrictWrappedLibraries(['@tanstack/react-table'])` — not the bare
      // call — because `no-restricted-imports` is one rule: this block replaces
      // the root's copy outright, including the per-directory
      // `wrapperLibOverrides` entry that unbans this lib's own package. Passing
      // the exemption in here restores it; spreading the bare patterns instead
      // would ban `@tanstack/react-table` in the one lib that is supposed to
      // import it.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...restrictWrappedLibraries(['@tanstack/react-table']).patterns,
            ...CLOSED_LAYER_BANS,
          ],
        },
      ],
    },
  },
];
