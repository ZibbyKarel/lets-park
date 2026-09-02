import nx from '@nx/eslint-plugin';

/**
 * Absolute path of the workspace root.
 *
 * Nx runs `eslint .` with the *project* directory as cwd, and every project's
 * `eslint.config.mjs` re-exports this file. Without an explicit `basePath`,
 * workspace-relative globs such as `apps/**` or `libs/form/**` would be matched
 * against project-relative file paths and silently never fire. Every config
 * object below whose `files` are workspace-relative therefore pins `basePath`.
 */
const workspaceRoot = import.meta.dirname;

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

/**
 * npm allow-lists per Nx `type:` tag (`allowedExternalImports`).
 *
 * ## Why the lists hang off `type:` and nowhere else
 *
 * `@nx/enforce-module-boundaries` collects **every** constraint whose source tag
 * the project carries and reports a violation if *any* of them bans the import
 * (`hasBannedImport` → `depConstraints.filter(...).find(...)` in
 * `@nx/eslint-plugin/dist/src/utils/runtime-lint-utils.js`). Constraints are
 * therefore ANDed, and a package must appear in the list of every matching
 * dimension. Spreading npm allow-lists across `type:`, `scope:` and `ds:` would
 * mean listing `react` in three places and getting an intersection nobody can
 * predict.
 *
 * `type:` is used because it is the one dimension that **partitions** the
 * workspace: every project carries exactly one `type:` tag, so a list here
 * covers everything and leaves no project unconstrained. `scope:` and `ds:`
 * stay purely about direction of dependency, which is what they model.
 *
 * ## Why a list is mandatory on every tag
 *
 * A tag with **no** `allowedExternalImports` constrains nothing at all — that is
 * how `libs/shared-types` was free to import Zod despite decision 0003
 * (Task 3 review, S3). An empty array (`[]`) is not the same thing: it bans
 * every npm package. Omission is inert; `[]` is a rule.
 *
 * Lists are deliberately short. When a task needs a package that is not here,
 * ESLint fails loudly with the package name and that task adds one line —
 * which is the point, because the addition shows up in review.
 */
const NPM_ALLOWLIST = {
  /**
   * Applications compose the whole stack; constraining them would just mirror
   * `package.json`. Spelled out rather than omitted so it reads as a decision.
   */
  app: ['*'],

  /**
   * Domain composition. No feature lib exists yet — extend when the first one
   * lands. Feature code reaches third parties through wrapper libs anyway
   * (see `WRAPPED_LIBRARIES`), so this list should stay near-empty.
   */
  feature: ['tslib'],

  /**
   * Design system (`libs/design-system/*`). React plus styling helpers and
   * Storybook; TanStack Table is here because `ds:compounds` owns the DataTable
   * wrapper. Never a backend package.
   */
  ui: [
    'tslib',
    'react',
    'react/*',
    'react-dom',
    'react-dom/*',
    'clsx',
    'tailwind-merge',
    'class-variance-authority',
    '@tanstack/react-table',
    '@tanstack/react-table/*',
    'storybook',
    'storybook/*',
    '@storybook/*',
    // Storybook's Tailwind v4 bridge, used only in `.storybook/main.ts`.
    '@tailwindcss/vite',
    // Test-only. The boundary rule cannot distinguish a spec file from a
    // shipped one, so these have to be allowed for the whole tag; keeping
    // them out would ban every design-system test.
    '@testing-library/react',
    '@testing-library/user-event',
    '@testing-library/jest-dom',
  ],

  /**
   * Wrapper libs. Each one exists precisely to be the single importer of one
   * third-party package, so this is the union of `WRAPPED_LIBRARIES` plus the
   * React/Next peers those wrappers are built on. The union is intentionally
   * coarse: *which* wrapper may import *which* package is enforced per-directory
   * by `no-restricted-imports` below, which this list cannot express.
   *
   * `libs/shared-types` also carries `type:util`, but it additionally carries
   * `layer:foundation`, whose empty list ANDs this one down to nothing.
   */
  util: [
    'tslib',
    'react',
    'react/*',
    'react-dom',
    'react-dom/*',
    'next',
    'next/*',
    ...Object.keys(WRAPPED_LIBRARIES).flatMap((pkg) => [pkg, `${pkg}/*`]),
    // `libs/form`'s Zod resolver for react-hook-form. It is not itself a
    // wrapped library (nothing else could import it instead — it only makes
    // sense paired with react-hook-form), so it is not in `WRAPPED_LIBRARIES`,
    // just allow-listed here alongside it.
    '@hookform/resolvers',
    '@hookform/resolvers/*',
    // `libs/query`'s bridge between the oRPC client and TanStack Query. Same
    // reasoning as `@hookform/resolvers`: it is not itself a wrapped library
    // (nothing could import it *instead* of something else — it only makes
    // sense paired with `@orpc/client` and `@tanstack/react-query`), so it is
    // not in `WRAPPED_LIBRARIES`, just allow-listed here alongside them.
    '@orpc/tanstack-query',
    '@orpc/tanstack-query/*',
    // `@orpc/contract` is deliberately **not** here, even though
    // `libs/api-client` needs `ContractRouterClient` to type its client. This
    // list applies to every `type:util` lib at once, so adding it would also
    // hand the contract builder to `libs/form`, `libs/i18n` and every wrapper
    // still to come — undoing the narrowness `NPM_ALLOWLIST.contract` is
    // documented to have. Instead `libs/contract` applies the type itself and
    // exports the result as `ContractClient` (see `libs/contract/src/api/router.ts`),
    // which is what a contract lib is for. See `doc/decision/0040-*`.
    // `libs/form` types `useAppForm` against a Zod schema (`z.input`/`z.output`)
    // and its resolver validates with Zod at runtime — it is the one wrapper
    // whose whole job is bridging Zod to react-hook-form, so it needs Zod
    // itself, not just the contract lib built on it.
    'zod',
    'zod/*',
    // Test-only, same reasoning as `ui` above: the boundary rule cannot tell
    // a spec file from a shipped one, so these have to be allowed for the
    // whole tag. Needed by `libs/i18n`'s component test (`IntlProvider`) and
    // `libs/form`'s (`userEvent.type`/`.click` on rendered primitives).
    '@testing-library/react',
    '@testing-library/jest-dom',
    '@testing-library/user-event',
  ],

  /**
   * `libs/contract`. `@orpc/contract` only — never `@orpc/client` or
   * `@orpc/server`, so the contract can not reach a transport
   * (`doc/decision/0007-*`).
   */
  contract: ['tslib', 'zod', 'zod/*', '@orpc/contract', '@orpc/contract/*'],

  /**
   * Data access (`libs/database`, Task 9). Prisma and nothing else — no HTTP
   * client, no frontend package.
   */
  data: ['tslib', 'prisma', 'prisma/*', '@prisma/client', '@prisma/*', '.prisma/*'],

  /**
   * `libs/shared-types`: zero npm dependencies, by decision 0003. It is imported
   * by `apps/api`, `libs/contract` and `libs/i18n` alike, so anything it pulls
   * in lands in all three. `[]` bans every package — Node builtins
   * (`node:fs`, …) are not npm nodes and stay allowed.
   */
  foundation: [],
};

/** Source files of every wrapper lib get their own package unbanned. */
const wrapperLibOverrides = Object.entries(WRAPPED_LIBRARIES).map(([pkg, { owner }]) => ({
  basePath: workspaceRoot,
  files: [`${owner}/**/*.ts`, `${owner}/**/*.tsx`, `${owner}/**/*.js`, `${owner}/**/*.jsx`],
  rules: {
    'no-restricted-imports': ['error', restrictWrappedLibraries([pkg])],
  },
}));

/**
 * `@nx/enforce-module-boundaries`'s `depConstraints`, factored out to a named
 * constant so `libs/form`'s test-only override below (`formSpecDepConstraints`)
 * can clone it rather than silently drifting from a second, hand-copied array.
 * Flat config replaces a rule's whole option object for a later, matching
 * config block — it does not merge — so any override has to restate every
 * entry, not just the one it changes (same reasoning as
 * `restrictWrappedLibraries` above).
 */
const DEP_CONSTRAINTS = [
  // --- type dimension -------------------------------------------
  // Every project carries exactly one `type:` tag, so this dimension
  // is where the npm allow-lists live. See NPM_ALLOWLIST above for
  // why they are not repeated on `scope:` / `ds:`.
  //
  // Layering, top to bottom, is acyclic:
  //   app → feature → ui → util → contract → foundation
  // `type:util` may depend on `type:contract` (that is what
  // `libs/api-client` is for), and `type:contract` depends on
  // `layer:foundation` — not on `type:util` — so the two directions
  // no longer form a cycle at the tag level (Task 3 review, N3).
  //
  // Applications compose everything; nothing may depend on them.
  {
    sourceTag: 'type:app',
    onlyDependOnLibsWithTags: ['*'],
    allowedExternalImports: NPM_ALLOWLIST.app,
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
    allowedExternalImports: NPM_ALLOWLIST.feature,
  },
  // The design system is domain-free: it must never reach into
  // feature or application code.
  {
    sourceTag: 'type:ui',
    onlyDependOnLibsWithTags: ['type:ui', 'type:util'],
    allowedExternalImports: NPM_ALLOWLIST.ui,
  },
  {
    sourceTag: 'type:util',
    onlyDependOnLibsWithTags: ['type:util', 'type:contract'],
    allowedExternalImports: NPM_ALLOWLIST.util,
  },
  // The contract sits below every wrapper and above the foundation:
  // Zod schemas plus the oRPC contract builder, nothing else.
  {
    sourceTag: 'type:contract',
    onlyDependOnLibsWithTags: ['layer:foundation'],
    allowedExternalImports: NPM_ALLOWLIST.contract,
  },
  {
    sourceTag: 'type:data',
    onlyDependOnLibsWithTags: ['type:data', 'type:util', 'type:contract'],
    allowedExternalImports: NPM_ALLOWLIST.data,
  },

  // --- foundation ------------------------------------------------
  // `libs/shared-types` is the bottom of the graph: it depends on no
  // workspace lib and on no npm package. Both empty arrays are
  // load-bearing — `onlyDependOnLibsWithTags: []` rejects every
  // tagged target, `allowedExternalImports: []` rejects every
  // package. See doc/decision/0003-* and doc/decision/0017-*.
  {
    sourceTag: 'layer:foundation',
    onlyDependOnLibsWithTags: [],
    allowedExternalImports: NPM_ALLOWLIST.foundation,
  },

  // --- scope dimension ------------------------------------------
  // Keeps frontend-only libs (e.g. libs/i18n, next-intl) out of
  // apps/api, and backend-only libs out of apps/web.
  // See doc/decision/0003-date-helpers-in-shared-types.md.
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
];

/**
 * `depConstraints` for `libs/form`'s own **test** files only: identical to
 * `DEP_CONSTRAINTS`, except the `type:util` entry also allows `type:ui`.
 *
 * Why this exists: `libs/form`'s test suite demonstrates the wrapper's whole
 * reason for being — a real, Zod-validated, submittable form built from
 * `@lets-park/form` plus design-system primitives (`Input`, `Select`,
 * `Checkbox`), with no direct `react-hook-form` import anywhere in that file
 * (`doc/decision/0030-*`, Task 18). That demo can only run if the test file
 * may import `design-system-primitives` (`type:ui`), which the general
 * `type:util` constraint forbids — composing the design system is supposed to
 * happen in app/feature code (global constraint 5), and `libs/form`'s own
 * *shipped* source must stay just as constrained as every other wrapper lib.
 *
 * Scoped to `libs/form/**\/*.spec.{ts,tsx}` below, nowhere else: every other
 * `type:util` project, and `libs/form`'s non-test source, still gets the
 * unmodified `DEP_CONSTRAINTS`.
 */
const formSpecDepConstraints = DEP_CONSTRAINTS.map((constraint) =>
  constraint.sourceTag === 'type:util'
    ? {
        ...constraint,
        onlyDependOnLibsWithTags: [...constraint.onlyDependOnLibsWithTags, 'type:ui'],
      }
    : constraint
);

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
          depConstraints: DEP_CONSTRAINTS,
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
    rules: {
      /**
       * Severity stays at Nx's `warn`; the lint target runs with
       * `--max-warnings=0` (see `nx.json`), so a warning still fails the build.
       * Only the options are tuned here, and only for bindings that **cannot be
       * deleted**:
       *
       * - `ignoreRestSiblings` — `const { icsToken: _token, ...rest } = user` is
       *   the idiomatic way to assert a field is absent from a projection. The
       *   named sibling exists solely so the rest element omits it; typescript-
       *   eslint defaults this to `false`, unlike the core ESLint rule.
       * - `argsIgnorePattern` / `caughtErrorsIgnorePattern` — a positional
       *   parameter before a used one, and a `catch` binding, cannot simply be
       *   removed. `_` marks the omission as deliberate.
       *
       * `varsIgnorePattern` is deliberately **not** set: an unused plain
       * variable can always just be deleted, so there is no honest reason to
       * silence it with a prefix.
       */
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  // Wrapper layers are mandatory in application and library code.
  {
    basePath: workspaceRoot,
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
  // See `formSpecDepConstraints` above: only `libs/form`'s own test files may
  // reach `design-system-primitives` (`type:ui`), to demonstrate the wrapper
  // building a real form without a direct `react-hook-form` import.
  // `allowCircularSelfDependency` is needed alongside it because that same
  // demo imports `@lets-park/form` by its workspace alias from inside
  // `libs/form` itself (the point being to prove the *public* API is enough),
  // which the boundary rule otherwise flags as a circular self-dependency.
  {
    basePath: workspaceRoot,
    files: ['libs/form/**/*.spec.ts', 'libs/form/**/*.spec.tsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allowCircularSelfDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: formSpecDepConstraints,
        },
      ],
    },
  },
  // `libs/shared-types` has to stay dependency-free: it is imported by
  // apps/api, libs/contract and libs/i18n alike. The Nx `type:util` constraint
  // cannot express this, because the same tag covers the wrapper libs, which
  // exist precisely to depend on third-party packages.
  // See doc/decision/0003-date-helpers-in-shared-types.md.
  {
    basePath: workspaceRoot,
    files: ['libs/shared-types/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...restrictWrappedLibraries().patterns,
            {
              group: ['zod', 'zod/*'],
              message:
                'libs/shared-types must not depend on Zod — it is imported by apps/api too. Zod schemas belong to libs/contract (@lets-park/contract).',
            },
          ],
        },
      ],
    },
  },
  // Structured logging only (nestjs-pino on the backend); no ad-hoc console output.
  {
    basePath: workspaceRoot,
    files: ['apps/api/**/*.ts', 'libs/**/*.ts', 'libs/**/*.tsx'],
    rules: {
      'no-console': 'error',
    },
  },
  // Standalone scripts and tooling are allowed to print to the console.
  {
    basePath: workspaceRoot,
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
