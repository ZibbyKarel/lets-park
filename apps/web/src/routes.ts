/**
 * Every path this application routes to, in one place.
 *
 * Two of them are load-bearing rather than cosmetic and that is why they are
 * constants instead of literals:
 *
 * - {@link LOGIN_ROUTE} is handed to `createAuth({ signInPath })`, so Auth.js
 *   redirects an unauthenticated request to the same page the proxy exempts
 *   from the session check. Spelling it twice is how a redirect loop is built.
 * - {@link AUTH_API_ROUTE_PREFIX} is fixed by Auth.js's own route handler
 *   (`app/api/auth/[...nextauth]/route.ts`) and by the callback URL registered
 *   with Okta (`/api/auth/callback/okta`, see `doc/auth.md`). The proxy must
 *   not intercept it, or signing in would require being signed in.
 *
 * Paths are Czech because they are user-visible, the same reason UI copy is
 * (`doc/decision/0029-*`). Identifiers around them stay English.
 */

/** The parking overview — the application's home screen (Task 24). */
export const LOT_ROUTE = '/';

/** The signed-out screen with the single Okta button. */
export const LOGIN_ROUTE = '/prihlaseni';

/** Personal settings: licence plate, preferred spot, ICS feed (Task 26). */
export const SETTINGS_ROUTE = '/nastaveni';

/** Administration: users, spots, reservation window (Task 27). Admins only. */
export const ADMIN_ROUTE = '/sprava';

/** Auth.js's own endpoints. Never proxied, never protected. */
export const AUTH_API_ROUTE_PREFIX = '/api/auth';

/**
 * This application's readiness probe. Public, because an orchestrator has no
 * bearer token and no way to obtain one — the same reasoning that makes the
 * API's probes `@Public()` (`doc/auth.md`, §Public routes).
 */
export const HEALTH_ROUTE = '/api/health';
