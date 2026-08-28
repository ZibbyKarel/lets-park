// Two independent ESM-only-package problems land in this one project, both
// shaped like `doc/decision/0020-orpc-is-esm-only-jest-must-transpile-it.md`:
//
// - `@orpc/contract` (a single `.mjs` build), pulled in transitively because
//   `errors.spec.ts` imports `ERROR_CODES` from `@lets-park/contract` at
//   runtime (not just as a type) — the same reason `libs/contract` itself
//   needs this.
// - `next-intl` and its transitive dependencies (`use-intl`,
//   `intl-messageformat`, `@formatjs/*`, `@schummar/icu-type-parser`,
//   `icu-minify`), all published `"type": "module"` as plain `.js`.
//
// `libs/contract`'s own `jest.config.cts` notes that a *third* project
// needing the `@orpc` fix should move it into the root `jest.preset.js`
// instead of copying it again — but Task 17 may only touch `libs/i18n/**`,
// so it stays local here too; whoever adds it a third time should centralize
// both this block and `libs/contract`'s.
const esmOnlyPackages = [
  '@orpc',
  'next-intl',
  'use-intl',
  'intl-messageformat',
  '@formatjs',
  '@schummar',
  'icu-minify',
];

module.exports = {
  displayName: 'i18n',
  preset: '../../jest.preset.js',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  transform: {
    // The generated negative-lookahead pattern below is Jest's asset
    // transform (images, css, …), and Jest applies whichever `transform`
    // pattern matches *first*. `.mjs` is not in its extension list, so
    // without adding it there too, an `.mjs` file would match this rule
    // before it ever reaches the babel-jest rule meant for it below.
    '^(?!.*\\.(js|jsx|ts|tsx|css|json|mjs)$)': '@nx/react/plugins/jest',
    '^.+\\.[tj]sx?$': ['babel-jest', { presets: ['@nx/react/babel'] }],
    '^.+\\.mjs$': ['babel-jest', { presets: ['@nx/react/babel'] }],
  },
  transformIgnorePatterns: [`/node_modules/(?!(?:${esmOnlyPackages.join('|')})/)`],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs'],
  coverageDirectory: '../../coverage/libs/i18n',
};
