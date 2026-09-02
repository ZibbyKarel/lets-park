/**
 * The database-contract suite: the `*.db.spec.ts` files, which need a real
 * PostgreSQL and are excluded from `api:test` for that reason.
 *
 * Same transform setup as `jest.config.cts` — see its header for why four
 * dependencies have to be transpiled — differing only in which files are
 * collected. Run with `nx run api:test-db` after
 * `docker compose --profile dev up -d`.
 */
module.exports = {
  displayName: 'api-db',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.db.spec.ts'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
    '^.+\\.mjs$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  transformIgnorePatterns: ['/node_modules/(?!(?:@orpc|@nestjs/config|@nestjs/passport|jose)/)'],
  moduleFileExtensions: ['ts', 'js', 'mjs', 'html'],
  coverageDirectory: '../../coverage/apps/api-db',
};
