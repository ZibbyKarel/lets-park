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
      command: 'npx nx run api:serve',
      url: `${apiUrl}/health/ready`,
      reuseExistingServer: !process.env['CI'],
      cwd: workspaceRoot,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
      // A suite is not a person. Eighteen tests across up to three concurrent
      // sessions issue roughly two hundred requests from **one** address, and
      // the shipped default of 300 per minute is a sliding window: one run fits,
      // two back to back do not. Measured, not guessed — running the suite in a
      // loop produced 52 × `429` on `/api/rpc/overview/day`, which the screen
      // renders as its error state and four unrelated specs reported as their
      // own failure.
      //
      // These are **environment values, not a code path**: the same throttler,
      // the same guard, the same defaults schema (`apps/api/src/env.ts`), just
      // numbers that suit a machine driving browsers. Nothing in this suite
      // tests rate limiting, so nothing is weakened by them. See
      // `doc/decision/0186-*` — including why a *reused* dev API keeps its own
      // values and what that looks like when it bites.
      env: {
        THROTTLE_LIMIT: '10000',
        THROTTLE_STRICT_LIMIT: '1000',
      },
    },
    {
      // `web:start`, not `web:dev` — the built app, on the port the OIDC
      // redirect URI and `CORS_ALLOWED_ORIGINS` name. `start` already
      // `dependsOn: ['build']`, and that build is Nx-cached and takes about six
      // seconds cold, so this costs less than the on-demand route compilation
      // `next dev` was paying on every first visit.
      //
      // The reason is not speed. In development React runs the app under
      // `StrictMode`, which mounts every effect twice — and this app comes up
      // with **two** socket.io connections per page as a result (measured: two
      // distinct `sid`s per tab, and the holder receiving its own `cell:locked`
      // broadcast, which the gateway sends to everybody *except* the asking
      // socket). Two connections means two `useCellLock` instances taking the
      // same hold, and when one of them tears down its cleanup emits
      // `cell:unlock` — which `LockService.release` honours, because it keys a
      // hold by **user**, not by socket. The hold is dropped while the dialog is
      // still open, every observer's tile goes back to "Volné", and
      // `cell-lock.spec.ts` fails. Measured at 5 failures in 20 runs.
      //
      // `StrictMode`'s double invoke is development-only, so the built app
      // opens one connection and takes one hold. Measured on this spec alone:
      // 5 failures in 20 runs against `web:dev`, 1 in 26 against `web:start`.
      // That last one is a residual, not a rounding error — the built app can
      // still open two connections, rarely, and it is recorded as an
      // application defect rather than retried away. See `doc/decision/0187-*`.
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
