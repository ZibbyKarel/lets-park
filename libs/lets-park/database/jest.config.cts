/**
 * The three `@orpc` lines are the ones `doc/decision/0020-*` describes: this
 * project's specs import `@lets-park/contract`, which pulls in the ESM-only
 * `@orpc/contract`, and Jest runs here as CommonJS. This is the **second**
 * copy of that configuration — per decision 0020, the third project to need it
 * (Task 11 or 12) moves it into `jest.preset.js` instead of copying again.
 */
module.exports = {
  displayName: 'database',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
    '^.+\\.mjs$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  transformIgnorePatterns: ['/node_modules/(?!(?:@orpc)/)'],
  moduleFileExtensions: ['ts', 'js', 'mjs', 'html'],
  coverageDirectory: '../../../coverage/libs/lets-park/database',
};
