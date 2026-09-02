import nx from '@nx/eslint-plugin';
import baseConfig, { restrictWrappedLibraries } from '../../../eslint.config.mjs';

/**
 * Packages the primitives layer must not reach for, even though `type:ui`
 * allows them workspace-wide.
 *
 * The design system is a closed layer with a near-zero runtime dependency
 * surface — `cx.ts` exists precisely so that no class-name helper has to be
 * installed. `NPM_ALLOWLIST.ui` in the root config cannot express that, because
 * it has to stay wide enough for `ds:compounds`, which owns the TanStack Table
 * wrapper.
 *
 * This lives here rather than as `allowedExternalImports` on the
 * `ds:primitives` tag because **that does not work**, and it was probed at Task
 * 8's merge rather than assumed: with `clsx` on `NPM_ALLOWLIST.ui` and absent
 * from a `ds:primitives` list, an `import clsx from 'clsx'` in this lib
 * produced no error at all. Nx does not intersect `allowedExternalImports`
 * across tag dimensions — one matching constraint that permits the package is
 * enough. The root config records the same finding beside the `ds:*` entries.
 *
 * Probe this rule before trusting it, the same way: add `import clsx from
 * 'clsx'` to any file here and run `npx nx lint design-system-primitives`. It
 * must name `clsx` and exit 1.
 */
const CLOSED_LAYER_BANS = [
  {
    group: ['clsx', 'clsx/*', 'classnames', 'tailwind-merge', 'class-variance-authority'],
    message:
      'The design system installs no class-name helper — use `cx` from `./cx`. See doc/decision/0052-overlay-tokens-and-one-layering-scale.md.',
  },
];

export default [
  ...nx.configs['flat/react'],
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      // The wrapper-ban patterns are spread back in: `no-restricted-imports` is
      // one rule, so setting it here replaces the root's copy outright.
      'no-restricted-imports': [
        'error',
        { patterns: [...restrictWrappedLibraries().patterns, ...CLOSED_LAYER_BANS] },
      ],
    },
  },
];
