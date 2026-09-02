import baseConfig, { restrictWrappedLibraries } from '../../../eslint.config.mjs';

/**
 * The tokens lib emits CSS custom properties and reads its inputs from disk.
 * It has no runtime dependencies at all, and nothing here should acquire one —
 * React least of all, since a token is a string and not a component.
 *
 * As in the primitives lib, this is a `no-restricted-imports` rule rather than
 * `allowedExternalImports` on the `ds:tokens` tag, because Nx does not
 * intersect `allowedExternalImports` across tag dimensions: a package permitted
 * by the `type:ui` list passes regardless of a second list on `ds:tokens`.
 * Probed at Task 8's merge — see the header of
 * `libs/design-system/primitives/eslint.config.mjs` for the probe and its
 * result.
 *
 * Probe this rule the same way before trusting it: add `import clsx from
 * 'clsx'` to any file here and run `npx nx lint design-system-tokens`. It must
 * name `clsx` and exit 1.
 */
const CLOSED_LAYER_BANS = [
  {
    group: ['clsx', 'clsx/*', 'classnames', 'tailwind-merge', 'class-variance-authority'],
    message:
      'The design system installs no class-name helper. See doc/decision/0052-overlay-tokens-and-one-layering-scale.md.',
  },
  {
    group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
    message:
      'The tokens lib emits CSS and must not depend on React — a token is a string, not a component.',
  },
];

export default [
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
