/**
 * The `@orpc` lines are the ones `doc/decision/0020-*` describes: these specs
 * import `@lets-park/contract`, which pulls in the ESM-only `@orpc/contract`,
 * and Jest runs this project as CommonJS. Decision 0020 said the third project
 * to need this configuration should move it into `jest.preset.js` rather than
 * copy it again; by the time this lib was written there were already **seven**
 * copies (`libs/contract`, `libs/database`, `libs/i18n`, `libs/query`,
 * `libs/api-client`, `libs/auth`, `apps/api`). `jest.preset.js` is outside this
 * task's file set, so the consolidation is flagged in the task report instead
 * of done here — the same call `apps/api/jest.config.cts` made.
 *
 * Neither of this lib's own packages needs transpiling: `ical-generator@11.1.1`
 * and `ical.js@2.2.1` are both `"type": "module"` but both publish a `require`
 * condition (`dist/index.cjs` and `dist/ical.es5.cjs`), which Jest's CommonJS
 * loader resolves unaided. Verified by `require()`-ing both from a plain
 * `.cjs` script before this file was written.
 */
module.exports = {
  displayName: 'calendar-export',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
    '^.+\\.mjs$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  transformIgnorePatterns: ['/node_modules/(?!(?:@orpc)/)'],
  moduleFileExtensions: ['ts', 'js', 'mjs', 'html'],
  coverageDirectory: '../../coverage/libs/calendar-export',
};
