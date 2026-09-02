/**
 * The three `@orpc` lines are the ones `doc/decision/0020-*` describes: this
 * project imports `@orpc/client`, `@orpc/client/fetch` and (transitively,
 * through `@lets-park/contract`) `@orpc/contract`, all of which are published
 * ESM-only — `"type": "module"`, `.mjs` builds, no `require` condition — while
 * Jest runs here as CommonJS.
 *
 * - `transformIgnorePatterns` stops excluding `@orpc` (Jest transforms nothing
 *   under `node_modules` by default, so the untransformed `import` reaches the
 *   CJS loader);
 * - the `.mjs` transform entry hands those files to ts-jest, which needs
 *   `allowJs` — set in `tsconfig.spec.json`;
 * - `mjs` joins `moduleFileExtensions` so resolution finds them at all.
 *
 * This is the **fifth** copy of that block (`libs/contract`, `libs/database`,
 * `apps/api`, `libs/i18n`, here). Decision 0020 asks for it to move into
 * `jest.preset.js` once a third project needs it; `apps/api/jest.config.cts`
 * already recorded why it did not do that, and the same holds here — the
 * consolidation edits four files this task does not own, three of them while a
 * parallel task is in flight. Flagged in the task report instead.
 */
module.exports = {
  displayName: 'api-client',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
    '^.+\\.mjs$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  transformIgnorePatterns: ['/node_modules/(?!(?:@orpc)/)'],
  moduleFileExtensions: ['ts', 'js', 'mjs', 'html'],
  coverageDirectory: '../../coverage/libs/api-client',
};
