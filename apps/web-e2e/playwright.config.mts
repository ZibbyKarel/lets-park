import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

/**
 * End-to-end configuration. See `doc/testing.md` for how to run this and what
 * has to be up first.
 *
 * Generated as a .mts file so Node forces ESM regardless of workspace
 * `type`. Playwright routes `.mts` through its ESM loader (dynamic import,
 * bypassing the pirates CJS-compile path), and Nx's native TS strip loads
 * `.mts` directly. Playwright's configLoader auto-discovers
 * `playwright.config.mts` via its extension list
 * (.ts/.js/.mts/.mjs/.cts/.cjs).
 *
 * ## The three things this file settles
 *
 * 1. **Ports.** The web app is on 4200, not 3000. `PORT=3000` in the workspace
 *    `.env` belongs to the API, Nx injects it into every target, and
 *    `apps/web/project.json` pins `next dev --port 4200` because of it. 4200 is
 *    also the origin named by `CORS_ALLOWED_ORIGINS` and by the redirect URI
 *    the app sends to the OIDC issuer, so it is not a free choice.
 * 2. **Both servers.** These specs sign in against a real issuer and read a
 *    real database through the API, so the API has to be up too. Its readiness
 *    probe (`/health/ready`, *outside* the `/api` prefix — `configure-app.ts`
 *    excludes it) checks the database, which makes it the right thing to wait
 *    on: a green probe means Postgres is up as well.
 * 3. **One browser.** The scaffold listed Chromium, Firefox and WebKit. This
 *    suite drives two and three concurrent sessions against one shared
 *    database, so running it three times over would triple the contention for
 *    no coverage: nothing here is browser-specific — no CSS assertions, no
 *    vendor-prefixed API. See `doc/decision/0182-*`.
 */
const baseURL = process.env['BASE_URL'] ?? 'http://localhost:4200';

/** Where the API lives. Only its readiness probe is used from here. */
const apiUrl = process.env['E2E_API_URL'] ?? 'http://localhost:3000';

export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './src' }),
  // Seeds the database and clears the target month. Runs once, before the
  // `setup` project signs anybody in.
  globalSetup: './src/support/global-setup.ts',
  // A failing e2e test in this project is a defect report, not a nuisance to be
  // retried away: a scenario that only passes on the second attempt is hiding
  // something. `forbidOnly` still guards against a committed `test.only`.
  retries: 0,
  forbidOnly: !!process.env['CI'],
  use: {
    baseURL,
    trace: 'on-first-retry',
    // Every spec drives Czech UI copy; the browser should ask for it too.
    locale: 'cs-CZ',
    timezoneId: 'Europe/Prague',
  },
  webServer: [
    {
      // **This entry almost never starts anything, and that is not a mistake.**
      // `@nx/playwright` reads these commands when it infers the `e2e` target
      // and turns any that names an Nx target into a real task dependency: `nx
      // show project web-e2e --json` shows `dependsOn: [{projects: ['api'],
      // target: 'serve'}]`, which exists only because of the string below. So
      // Nx starts the API first, with Nx's environment, and Playwright finds
      // port 3000 already answering and adopts it.
      //
      // The entry is kept because it is what *declares* that dependency, and
      // because it still starts an API when something runs `playwright test`
      // directly. But nothing set here reaches an Nx-started process. An `env`
      // block raising `THROTTLE_LIMIT` used to sit here and never applied —
      // measured, `X-RateLimit-Limit: 300` and strict `20`, the shipped
      // defaults — so it was removed rather than left looking effective.
      // `doc/decision/0186-*` records what actually keeps the suite under the
      // limit and what to do on the day it does not.
      command: 'npx nx run api:serve',
      url: `${apiUrl}/health/ready`,
      // Unconditionally `true`, unlike the web server below: Nx's `dependsOn`
      // has already started this one whether or not `CI` is set, so refusing to
      // reuse it under CI would only make Playwright try to bind an occupied
      // port and fail.
      reuseExistingServer: true,
      cwd: workspaceRoot,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // `web:start`, not `web:dev` — the built app, on the port the OIDC
      // redirect URI and `CORS_ALLOWED_ORIGINS` name. `start` already
      // `dependsOn: ['build']`, and that build is Nx-cached and takes about six
      // seconds cold, so this costs less than the on-demand route compilation
      // `next dev` was paying on every first visit.
      //
      // The reason is not speed. `next dev` runs React under `StrictMode`,
      // which mounts every effect twice, so a dev server gives every page a
      // second socket.io connection as a matter of course. A page with two
      // connections sits in the day room twice and hears its own `cell:locked`,
      // which the gateway broadcasts to everybody *except* the asking socket.
      // `doc/decision/0187-*` has the packet traces and the measured rates.
      //
      // The built app does *not* have a second way of doing this, though that
      // was believed and recorded for a while: measured per document rather
      // than per page, it is one connection, 89 documents out of 89
      // (`doc/decision/0221-*`, `src/realtime-connection.spec.ts`).
      command: 'npx nx run web:start -- --port 4200',
      url: `${baseURL}/api/health`,
      reuseExistingServer: !process.env['CI'],
      cwd: workspaceRoot,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
  projects: [
    {
      name: 'setup',
      testMatch: /support\/auth\.setup\.ts$/u,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      testIgnore: /support\//u,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
