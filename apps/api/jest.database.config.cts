/**
 * The database-contract suite: the `*.db.spec.ts` files, which need a real
 * PostgreSQL and are excluded from `api:test` for that reason.
 *
 * Same transform setup as `jest.config.cts` — see its header for why four
 * dependencies have to be transpiled — differing only in which files are
 * collected. Run with `nx run api:test-db` after
 * `docker compose --profile dev up -d`.
 *
 * `globalSetup` creates a throwaway database for the run and repoints
 * `DATABASE_URL` at it, so the developer's seeded `lets_park` is never written
 * to; `globalTeardown` drops it. Task 13 needs this because its concurrency
 * tests have to **commit** to race at all, and a committed `AuditLog` row can
 * never be deleted again. See `src/testing/database/test-database.ts`.
 *
 * `maxWorkers: 1` for the same reason `--runInBand` is on the target: the specs
 * create their own concurrency deliberately, and workers racing each other on
 * top of that would make a failure impossible to attribute.
 */
module.exports = {
  displayName: 'api-db',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.db.spec.ts'],
  globalSetup: '<rootDir>/src/testing/database/global-setup.ts',
  globalTeardown: '<rootDir>/src/testing/database/global-teardown.ts',
  maxWorkers: 1,
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
    '^.+\\.mjs$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  transformIgnorePatterns: ['/node_modules/(?!(?:@orpc|@nestjs/config|@nestjs/passport|jose)/)'],
  moduleFileExtensions: ['ts', 'js', 'mjs', 'html'],
  coverageDirectory: '../../coverage/apps/api-db',
};
