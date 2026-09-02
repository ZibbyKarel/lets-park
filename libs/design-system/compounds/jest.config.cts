/**
 * `@tanstack/react-table` v9 and its whole dependency chain
 * (`@tanstack/table-core`, `@tanstack/react-store`, `@tanstack/store`) are
 * published ESM-only — `"type": "module"`, no `require` condition in
 * `exports` — while Jest runs here as CommonJS. Without the
 * `transformIgnorePatterns` line below, `data-table.spec.tsx` fails to even
 * parse with `SyntaxError: Cannot use import statement outside a module`.
 *
 * Same shape as `doc/decision/0020-orpc-is-esm-only-jest-must-transpile-it.md`,
 * and the **sixth** copy of that block in the workspace (`libs/contract`,
 * `libs/database`, `apps/api`, `libs/i18n`, `libs/api-client`, here). Decision
 * 0020 asks for the consolidation into `jest.preset.js` once a third project
 * needs it; every copy since has recorded the same reason for not doing it, and
 * it holds again here — this task may only touch
 * `libs/design-system/compounds/**`, and the move would edit five files that
 * other tasks are in flight on. Flagged in the task report instead.
 *
 * Only these four packages are listed, not the whole `@tanstack` scope:
 * `@tanstack/react-query` (used by `libs/query`) does ship a `require`
 * condition and must keep being ignored, so a scope-wide pattern would
 * transform a package that never needed it.
 *
 * The build shipped is `.js`, not `.mjs`, so the `.mjs` transform entry the
 * other five copies carry is not needed here — the `[tj]sx?` rule below already
 * matches. Note that no asset-transform entry is declared either (the design
 * system imports no images or CSS modules), so the pattern-ordering trap those
 * configs document does not arise.
 */
const esmOnlyPackages = [
  '@tanstack/react-table',
  '@tanstack/table-core',
  '@tanstack/react-store',
  '@tanstack/store',
];

module.exports = {
  displayName: 'design-system-compounds',
  preset: '../../../jest.preset.js',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  transform: {
    '^.+\\.[tj]sx?$': ['babel-jest', { presets: ['@nx/react/babel'] }],
  },
  transformIgnorePatterns: [`/node_modules/(?!(?:${esmOnlyPackages.join('|')})/)`],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../../coverage/libs/design-system/compounds',
};
