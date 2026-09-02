/**
 * `@orpc/tanstack-query` (and, through `@lets-park/api-client` and
 * `@lets-park/contract`, `@orpc/client` and `@orpc/contract`) are published
 * ESM-only — `"type": "module"`, `.mjs` builds, no `require` condition — while
 * Jest runs here as CommonJS. Same three lines as `libs/i18n/jest.config.cts`,
 * described in `doc/decision/0020-*`; `@tanstack/react-query` itself needs
 * none of this, it ships a `require` condition.
 *
 * The consolidation into `jest.preset.js` that decision 0020 asks for is
 * deliberately still not done here — see `libs/api-client/jest.config.cts`.
 */
const esmOnlyPackages = ['@orpc'];

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
  transformIgnorePatterns: [`/node_modules/(?!(?:${esmOnlyPackages.join('|')})/)`],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs'],
  coverageDirectory: '../../coverage/libs/query',
};
