/**
 * `@orpc/tanstack-query` (and, through `@lets-park/api-client` and
 * `@lets-park/contract`, `@orpc/client` and `@orpc/contract`) are published
 * ESM-only while Jest runs here as CommonJS. `@tanstack/react-query` itself
 * needs none of this — it ships a `require` condition.
 *
 * `transformIgnorePatterns` for those packages now lives in `jest.preset.js`
 * (`doc/decision/0020-*`, done in `doc/decision/0297-*`). The `.mjs` transform
 * entry and `moduleFileExtensions` stay here: this project runs babel-jest,
 * not ts-jest, so the entry is not the same one `libs/api-client` needs.
 */
module.exports = {
  displayName: 'query',
  preset: '../../jest.preset.js',
  // jsdom plus the Web APIs it does not implement (`fetch`, `Request`,
  // `Response`, the stream classes) — this lib's tests drive a real `RPCLink`.
  // See `jest-environment-web.cjs` and `doc/decision/0037-*`.
  testEnvironment: '<rootDir>/jest-environment-web.cjs',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  transform: {
    // The generated negative-lookahead pattern below is Jest's asset transform
    // (images, css, …), and Jest applies whichever `transform` pattern matches
    // *first*. `.mjs` is not in its extension list, so without adding it there
    // too, an `.mjs` file would match this rule before it ever reached the
    // babel-jest rule meant for it below.
    '^(?!.*\\.(js|jsx|ts|tsx|css|json|mjs)$)': '@nx/react/plugins/jest',
    '^.+\\.[tj]sx?$': ['babel-jest', { presets: ['@nx/react/babel'] }],
    '^.+\\.mjs$': ['babel-jest', { presets: ['@nx/react/babel'] }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs'],
  coverageDirectory: '../../coverage/libs/query',
};
