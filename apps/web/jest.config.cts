const nextJest = require('next/jest.js');

/**
 * Packages on this app's test path that are published ESM-only — `"type":
 * "module"`, or a lone `.mjs` build, with no `require` condition — while Jest
 * runs as CommonJS. Same list and same shape as `libs/i18n`'s and
 * `libs/query`'s; the reasoning is in
 * `doc/decision/0020-orpc-is-esm-only-jest-must-transpile-it.md` and
 * `doc/decision/0025-next-intl-esm-jest-transform.md`.
 *
 * Decision 0020 asks that a third project needing this consolidate the block
 * into the root `jest.preset.js`. **That would not help here**, and this is a
 * measured statement rather than a guess: `next/jest` builds its own config
 * and *replaces* `transformIgnorePatterns` with `['/node_modules/',
 * '^.+\\.module\\.(css|sass|scss)$']`, so anything the preset set is gone by
 * the time the resolved config exists. The override therefore has to be
 * applied to the resolved object below, after `createJestConfig` has run.
 */
const esmOnlyPackages = [
  // `@lets-park/api-client` and `@lets-park/contract`.
  '@orpc',
  // `@lets-park/i18n`.
  'next-intl',
  'use-intl',
  'intl-messageformat',
  '@formatjs',
  '@schummar',
  'icu-minify',
  // `@lets-park/auth`.
  'next-auth',
  '@auth',
  'jose',
  'oauth4webapi',
  '@panva',
  'preact',
  // `@lets-park/design-system/compounds` — `DataTable`, reached through the
  // barrel by anything importing `EmptyState`. Only these four `@tanstack`
  // packages, never the whole scope: `@tanstack/react-query` ships a `require`
  // condition and must keep being ignored.
  '@tanstack/react-table',
  '@tanstack/table-core',
  '@tanstack/react-store',
  '@tanstack/store',
];

const createJestConfig = nextJest({
  dir: './',
});

const config = {
  displayName: 'web',
  preset: '../../jest.preset.js',
  transform: {
    '^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': '@nx/react/plugins/jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs'],
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  coverageDirectory: '../../coverage/apps/web',
  // jsdom plus the Web APIs it does not implement (`fetch`, `Request`,
  // `Response`, the stream classes). See `jest-environment-web.cjs` and
  // `doc/decision/0037-*`.
  testEnvironment: '<rootDir>/jest-environment-web.cjs',
};

const jestConfig = createJestConfig(config);

module.exports = async () => {
  const resolved = await jestConfig();
  // Disable SWC path alias resolution — handled by Nx jest resolver.
  for (const value of Object.values(resolved.transform)) {
    if (Array.isArray(value) && value[1]?.resolvedBaseUrl) {
      value[1] = { ...value[1], resolvedBaseUrl: undefined };
    }
  }
  // See `esmOnlyPackages` above: `next/jest` overwrote whatever was set, so
  // the exemption is re-applied here. The CSS-module entry is Next's own and
  // is kept — dropping it would send `*.module.css` through the JS transform.
  resolved.transformIgnorePatterns = [
    `/node_modules/(?!(?:${esmOnlyPackages.join('|')})/)`,
    '^.+\\.module\\.(css|sass|scss)$',
  ];
  return resolved;
};
