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

/**
 * The root's `@nx/enforce-module-boundaries` options, read back out of the base
 * config rather than hand-copied.
 *
 * Flat config *replaces* a rule's whole option object for a later matching
 * block — it does not merge — so an override has to restate every entry. The
 * root config makes the same point about `DEP_CONSTRAINTS` and solves it there
 * by exporting nothing; taking the array from the live config is the version of
 * that which cannot drift. It throws rather than silently producing an empty
 * constraint set, because `depConstraints: []` would turn the rule off.
 */
function moduleBoundaryOptions() {
  for (const block of baseConfig) {
    const rule = block?.rules?.['@nx/enforce-module-boundaries'];
    if (Array.isArray(rule) && rule[1]?.depConstraints?.length > 0) {
      return rule[1];
    }
  }

  throw new Error(
    '@nx/enforce-module-boundaries options not found in the root config — this override would ' +
      'otherwise disable the rule for design-system-tokens rather than narrowing it.'
  );
}

const BOUNDARY_OPTIONS = moduleBoundaryOptions();

/**
 * `depConstraints` for this lib's own **test** files only: identical to the
 * root's, except the `type:ui` entry also allows `tailwindcss`.
 *
 * Why this exists: `src/lib/theme-css.spec.ts` compiles `assets/theme.css` with
 * `compile()` from the real `tailwindcss`, at the version the app builds with,
 * and reads the emitted rules. That is the whole point of it — the bridge file
 * is hand-written, and the two claims it used to make about the spacing scale
 * were both false in a way only a compiler could show. A re-implementation of
 * Tailwind's resolution inside the test would prove nothing about the file.
 *
 * Nothing shipped from this lib imports `tailwindcss`, and nothing should: the
 * tokens lib emits CSS custom properties and knows nothing about utilities.
 * Scoped to `src/**\/*.spec.ts` rather than added to `NPM_ALLOWLIST.ui`, which
 * would reach the shipped source of the primitives and compounds libs too —
 * the same reasoning the root config gives for `ical.js` in
 * `calendarExportSpecDepConstraints`.
 *
 * Probe it before trusting it: add `import { compile } from 'tailwindcss'` to
 * `src/lib/colors.ts` and run `npx nx lint design-system-tokens`. It must name
 * `tailwindcss` and exit 1.
 */
const specDepConstraints = BOUNDARY_OPTIONS.depConstraints.map((constraint) =>
  constraint.sourceTag === 'type:ui'
    ? {
        ...constraint,
        allowedExternalImports: [...constraint.allowedExternalImports, 'tailwindcss'],
      }
    : constraint
);

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
  {
    files: ['src/**/*.spec.ts'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        { ...BOUNDARY_OPTIONS, depConstraints: specDepConstraints },
      ],
    },
  },
];
