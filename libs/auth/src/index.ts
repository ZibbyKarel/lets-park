/**
 * `@lets-park/auth` — the wrapper lib that owns `next-auth` (Auth.js v5).
 *
 * This is the **server** entry point: the Auth.js instance, its configuration,
 * and the helpers that run in the Next.js server runtime. Browser components
 * import `@lets-park/auth/client` instead — see `libs/auth/src/lib/client.tsx`
 * for why the two are kept apart.
 *
 * What comes out of here:
 *
 * - {@link createAuth} — one call in `apps/web` produces the route handlers,
 *   the universal `auth()`, server-side `signIn`/`signOut`, and a
 *   `getAccessToken` ready to hand to `createApiClient`;
 * - {@link createAuthConfig} and the three callbacks it is built from, so the
 *   rotation and authorization rules are testable on their own;
 * - {@link REFRESH_TOKEN_ERROR} — the one error a session can report.
 *
 * See `doc/wrappers.md` for why the direct `next-auth` import is banned
 * everywhere else, and `doc/auth.md` for the flow end to end.
 */

export { createAuth } from './lib/create-auth';
export type { Auth } from './lib/create-auth';

export {
  createAuthConfig,
  DEFAULT_SESSION_MAX_AGE_SECONDS,
  isAuthorized,
  OKTA_SCOPES,
  projectSession,
  rotateAccessToken,
} from './lib/config';
export type { AuthOptions } from './lib/config';

/**
 * `createSignOutRegistry` and `SignOutRevocationUnavailableError` are the
 * sign-out revocation surface. `sharedRevokedStore` is deliberately **not**
 * re-exported: it hands out a process-global mutable map that any importer
 * could `.clear()`, wiping every revocation in the process. The tests that need
 * to reset it deep-import `./lib/revocation` instead, so the sharp edge stays
 * inside the lib. `applySessionLifecycle` is likewise internal — its only
 * production caller is `createAuthConfig`.
 */
export { createSignOutRegistry, SignOutRevocationUnavailableError } from './lib/revocation';
export type { RevocableToken, SignOutRegistry, SignOutRegistryOptions } from './lib/revocation';

export { accessTokenOf, createAccessTokenProvider } from './lib/access-token';

export {
  createTokenRefresher,
  REFRESH_SKEW_SECONDS,
  shouldRefresh,
  TokenRefreshError,
} from './lib/refresh';
export type { RefreshedTokens, TokenRefresher, TokenRefresherOptions } from './lib/refresh';

export { OKTA_PROVIDER_ID, REFRESH_TOKEN_ERROR } from './lib/session';
export type { AuthSession, RefreshTokenError, SessionReader } from './lib/session';
