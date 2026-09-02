/**
 * The three URLs the browser and the server derive from one env variable.
 *
 * `NEXT_PUBLIC_API_URL` is the **oRPC endpoint**, prefix included
 * (`http://localhost:3000/api`, see `doc/environment.md`). Two other things
 * live on the same deployment and are *not* under that prefix, so both are
 * derived from its origin rather than configured separately — one variable
 * cannot drift from itself.
 */

/**
 * Path of the API's readiness probe.
 *
 * **Not** `/api/health/ready`. `configureApp()` passes the health prefix to
 * `setGlobalPrefix`'s `exclude`, so the probes sit at the server root while
 * every procedure sits under `/api` (`apps/api/src/health/health.controller.ts`,
 * `doc/auth.md` §Public routes). Building this path off the configured URL
 * *including* its prefix is the mistake that produces a health check which is
 * red on a perfectly healthy deployment.
 */
export const API_READINESS_PATH = '/health/ready';

/**
 * Origin of the API — scheme, host and port, with no path.
 *
 * This is what Socket.io needs. `io(url)` reads a path in the URL as a
 * **namespace**, not as a mount point: handing it `http://host/api` would make
 * the client dial the `/api` namespace, which the gateway (Task 15) does not
 * register, and the handshake would be refused for a reason that looks like an
 * auth failure. `RealtimeSocketOptions.url` is documented as "origin of the
 * API" for exactly this reason; the Socket.io mount point is its separate
 * `path` option, which defaults to `DEFAULT_SOCKET_PATH`.
 *
 * @throws {TypeError} when `apiUrl` is not an absolute URL. It always is —
 * `apps/web/src/env.ts` validates it with `z.url()` before the server serves
 * anything — so a throw here means the schema was bypassed.
 */
export function apiOriginOf(apiUrl: string): string {
  return new URL(apiUrl).origin;
}

/** Absolute URL of the API's readiness probe. See {@link API_READINESS_PATH}. */
export function apiReadinessUrl(apiUrl: string): string {
  return new URL(API_READINESS_PATH, apiOriginOf(apiUrl)).toString();
}
