import nx from '@nx/eslint-plugin';

/**
 * Third-party libraries that application and library code must never import
 * directly. Each one is owned by exactly one wrapper lib, which is the single
 * place in the workspace allowed to import it (see `plan.md`, wrapper table).
 *
 * key   = npm package that is banned
 * owner = directory of the wrapper lib that owns it (exempted from the ban)
 * use   = import path developers should use instead
 */
const WRAPPED_LIBRARIES = {
  'react-hook-form': {
    owner: 'libs/form',
    use: '@lets-park/form',
  },
  '@tanstack/react-table': {
    owner: 'libs/design-system/compounds',
    use: '@lets-park/design-system/compounds',
  },
  '@tanstack/react-query': {
    owner: 'libs/query',
    use: '@lets-park/query',
  },
  '@orpc/client': {
    owner: 'libs/api-client',
    use: '@lets-park/api-client',
  },
  'socket.io-client': {
    owner: 'libs/realtime-client',
    use: '@lets-park/realtime-client',
  },
  'next-auth': {
    owner: 'libs/auth',
    use: '@lets-park/auth',
  },
  'ical-generator': {
    owner: 'libs/calendar-export',
    use: '@lets-park/calendar-export',
  },
  'next-intl': {
    owner: 'libs/i18n',
    use: '@lets-park/i18n',
  },
};

/**
 * Builds a `no-restricted-imports` option object banning every wrapped library
 * except the ones listed in `allowedPackages`.
 *
 * Flat config does not merge rule options: an override that re-declares
 * `no-restricted-imports` replaces the whole option object. Every wrapper lib
 * override therefore has to restate the full ban list minus its own package,
 * which is why both the global block and the overrides are generated from the
 * single `WRAPPED_LIBRARIES` map above.
 */
function restrictWrappedLibraries(allowedPackages = []) {
  return {
    patterns: Object.entries(WRAPPED_LIBRARIES)
      .filter(([pkg]) => !allowedPackages.includes(pkg))
      .map(([pkg, { owner, use }]) => ({
        group: [pkg, `${pkg}/*`],
        message: `Do not import "${pkg}" directly — use the wrapper lib ${use} (${owner}). Only ${owner} may import "${pkg}".`,
      })),
  };
}

/** Source files of every wrapper lib get their own package unbanned. */
const wrapperLibOverrides = Object.entries(WRAPPED_LIBRARIES).map(([pkg, { owner }]) => ({
  files: [`${owner}/**/*.ts`, `${owner}/**/*.tsx`, `${owner}/**/*.js`, `${owner}/**/*.jsx`],
  rules: {
    'no-restricted-imports': ['error', restrictWrappedLibraries([pkg])],
  },
}));

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/out-tsc',
      '**/.next',
      '**/coverage',
      '**/playwright-report',
      '**/test-output',
      // Exported design assets, not workspace source.
      'doc/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            // --- type dimension -------------------------------------------
            // Applications compose everything; nothing may depend on them.
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: ['*'],
            },
            // Feature libs hold domain composition.
            {
              sourceTag: 'type:feature',
              onlyDependOnLibsWithTags: [
                'type:feature',
                'type:ui',
                'type:util',
                'type:contract',
                'type:data',
              ],
            },
            // The design system is domain-free: it must never reach into
            // feature or application code.
            {
              sourceTag: 'type:ui',
              onlyDependOnLibsWithTags: ['type:ui', 'type:util'],
            },
            {
              sourceTag: 'type:util',
              onlyDependOnLibsWithTags: ['type:util', 'type:contract'],
            },
            // The contract is the root of the dependency graph: schemas only.
            {
              sourceTag: 'type:contract',
              onlyDependOnLibsWithTags: ['type:util'],
              allowedExternalImports: ['zod', 'zod/*', '@orpc/contract', 'tslib'],
            },
            {
              sourceTag: 'type:data',
              onlyDependOnLibsWithTags: ['type:data', 'type:util', 'type:contract'],
            },

            // --- scope dimension ------------------------------------------
            // Keeps frontend-only libs (e.g. libs/i18n, next-intl) out of
            // apps/api, and backend-only libs out of apps/web.
            // See doc/decision/0003-date-helpery-v-shared-types.md.
            {
              sourceTag: 'scope:web',
              onlyDependOnLibsWithTags: ['scope:web', 'scope:shared'],
            },
            {
              sourceTag: 'scope:api',
              onlyDependOnLibsWithTags: ['scope:api', 'scope:shared'],
            },
            {
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },

            // --- design-system layer dimension ----------------------------
            // tokens -> primitives -> compounds, one direction only.
            // `type:ui` alone cannot express this because all three layers
            // carry that tag.
            {
              sourceTag: 'ds:tokens',
              onlyDependOnLibsWithTags: ['type:util'],
            },
            {
              sourceTag: 'ds:primitives',
              onlyDependOnLibsWithTags: ['ds:tokens', 'type:util'],
            },
            {
              sourceTag: 'ds:compounds',
              onlyDependOnLibsWithTags: ['ds:tokens', 'ds:primitives', 'type:util'],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    rules: {},
  },
  // Wrapper layers are mandatory in application and library code.
  {
    files: [
      'apps/**/*.ts',
      'apps/**/*.tsx',
      'apps/**/*.js',
      'apps/**/*.jsx',
      'libs/**/*.ts',
      'libs/**/*.tsx',
      'libs/**/*.js',
      'libs/**/*.jsx',
    ],
    rules: {
      'no-restricted-imports': ['error', restrictWrappedLibraries()],
    },
  },
  ...wrapperLibOverrides,
  // Structured logging only (nestjs-pino on the backend); no ad-hoc console output.
  {
    files: ['apps/api/**/*.ts', 'libs/**/*.ts', 'libs/**/*.tsx'],
    rules: {
      'no-console': 'error',
    },
  },
  // Standalone scripts and tooling are allowed to print to the console.
  {
    files: [
      'tools/**',
      'scripts/**',
      '**/scripts/**',
      '**/*.config.ts',
      '**/*.config.cts',
      '**/*.config.mts',
      '**/*.config.js',
    ],
    rules: {
      'no-console': 'off',
    },
  },
];
