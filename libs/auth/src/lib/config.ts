/**
 * The Auth.js configuration: one Okta OIDC provider plus the three callbacks
 * that make a short-lived access token usable for the life of a session.
 *
 * Everything here is a pure function of its arguments — no `process.env`, no
 * module-level state, no branch on `NODE_ENV`. Dev, e2e and production build
 * this same object and differ only in the values `apps/web` passes in, which
 * is the rule Task 11 has to hold to on the API side as well.
 */

import Okta from 'next-auth/providers/okta';
import type { NextAuthConfig } from 'next-auth';
import type { Account, Session } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import { OKTA_PROVIDER_ID, REFRESH_TOKEN_ERROR } from './session';
import { createTokenRefresher, shouldRefresh } from './refresh';
import type { TokenRefresher } from './refresh';

/**
 * OAuth2 scopes requested at sign-in.
 *
 * `offline_access` is the load-bearing one: without it Okta issues no refresh
 * token at all, the `jwt` callback below has nothing to rotate, and the session
 * dies with the first access token. The other three are what the API's JIT
 * provisioning (Task 11) reads the user's identity from.
 */
export const OKTA_SCOPES = 'openid profile email offline_access';

export interface AuthOptions {
  /** `AUTH_OKTA_ISSUER`. Validated in `apps/web/src/env.ts`. */
  readonly issuer: string;
  /** `AUTH_OKTA_CLIENT_ID`. */
  readonly clientId: string;
  /**
   * `AUTH_OKTA_CLIENT_SECRET`. Server-only: it is used for the OAuth2 code
   * exchange and for refresh, both of which run in the Next.js server runtime.
   * Never reference it from a component, and never give it a `NEXT_PUBLIC_`
   * name — that prefix is what puts a value in the browser bundle.
   */
  readonly clientSecret: string;
  /** `AUTH_SECRET`. Encrypts the session cookie. Server-only, same as above. */
  readonly secret: string;
  /**
   * Path of the application's own sign-in page. When omitted, Auth.js serves
   * its built-in one at `/api/auth/signin`. `apps/web` (Task 23) supplies the
   * real route.
   */
  readonly signInPath?: string;
  /**
   * How long a session cookie stays valid, in seconds. Defaults to Auth.js's
   * 30 days. The access token inside it is renewed independently and far more
   * often — see {@link REFRESH_SKEW_SECONDS}.
   */
  readonly sessionMaxAgeSeconds?: number;
  /**
   * Override the `fetch` used for OIDC discovery and token refresh. Mirrors
   * `ApiClientOptions.fetch` in `libs/api-client`: a transport seam for tests
   * and SSR, not an authentication switch — nothing it can be set to skips a
   * signature check or invents a session.
   */
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * Stores the tokens Okta issued at sign-in.
 *
 * Auth.js hands the `account` to the `jwt` callback exactly once, on the
 * request that completes the OAuth2 code exchange; after that only the JWT
 * survives, so anything not copied here is gone for good.
 */
function seedFromAccount(token: JWT, account: Account): JWT {
  const { access_token: accessToken, expires_at: expiresAt, refresh_token: refreshToken } = account;

  if (typeof accessToken !== 'string' || typeof expiresAt !== 'number') {
    // Not a crash: the session simply carries no bearer, every API call comes
    // back unauthenticated, and `useRequireAuth` sends the user back to Okta.
    // Throwing here would surface as an opaque Auth.js `Configuration` error.
    return markRefreshFailed(token);
  }

  // `error` is removed by omission rather than set to `undefined`:
  // `exactOptionalPropertyTypes` is on, so an optional property either holds a
  // value or is not there at all.
  const { error: _error, ...rest } = token;

  return {
    ...rest,
    accessToken,
    expiresAt,
    ...(typeof refreshToken === 'string' && refreshToken !== '' ? { refreshToken } : {}),
  };
}

/**
 * Drops the access token and marks the session as failed.
 *
 * Dropping rather than keeping the expired token is the point: a request with
 * no `Authorization` header is unauthenticated, which the UI already knows how
 * to handle, whereas one carrying a dead token produces a 401 that looks like
 * a bug. The refresh token is dropped too — it is what just failed.
 */
function markRefreshFailed(token: JWT): JWT {
  const {
    accessToken: _accessToken,
    expiresAt: _expiresAt,
    refreshToken: _refreshToken,
    ...rest
  } = token;
  return { ...rest, error: REFRESH_TOKEN_ERROR };
}

/**
 * The `jwt` callback's whole logic, as a plain function of a token, an
 * optional account and a refresher.
 *
 * Split out from the config object so the rotation rules — renew *before*
 * expiry, do not renew a healthy token, fail closed — are testable without an
 * Auth.js instance or an HTTP request.
 */
export async function rotateAccessToken(
  token: JWT,
  account: Account | null | undefined,
  refresh: TokenRefresher
): Promise<JWT> {
  if (account) return seedFromAccount(token, account);

  // A session that already failed to refresh stays failed. Retrying on every
  // request would hammer the token endpoint with a credential we know is dead.
  if (token.error !== undefined) return token;

  if (typeof token.expiresAt !== 'number') return markRefreshFailed(token);
  if (!shouldRefresh(token.expiresAt)) return token;
  if (typeof token.refreshToken !== 'string' || token.refreshToken === '') {
    return markRefreshFailed(token);
  }

  try {
    const renewed = await refresh(token.refreshToken);
    return {
      ...token,
      accessToken: renewed.accessToken,
      expiresAt: renewed.expiresAt,
      refreshToken: renewed.refreshToken,
    };
  } catch {
    // Nothing is logged here on purpose. The only things worth naming are the
    // provider's error code — already lost by the time this catches — and the
    // token, which must never reach a log. The failure is reported through the
    // session instead, where the UI can act on it.
    return markRefreshFailed(token);
  }
}

/**
 * The `session` callback: projects the JWT onto what a browser may see.
 *
 * The refresh token is **not** copied. It stays in the encrypted, httpOnly
 * cookie that only the Next.js server can decrypt, so the long-lived
 * credential never crosses into JavaScript — while the short-lived access
 * token does, because `libs/realtime-client` has to put it in a Socket.io
 * handshake from the browser.
 */
export function projectSession(session: Session, token: JWT): Session {
  // Both fields are rebuilt from the token every time rather than merged on top
  // of whatever the incoming session carried — `exactOptionalPropertyTypes`
  // aside, that is what guarantees a stale `accessToken` cannot survive a
  // failed refresh.
  const { accessToken: _accessToken, error: _error, ...rest } = session;

  if (token.error !== undefined) {
    return { ...rest, error: token.error };
  }
  return {
    ...rest,
    ...(typeof token.accessToken === 'string' ? { accessToken: token.accessToken } : {}),
  };
}

/**
 * The `authorized` callback, used by Next.js middleware.
 *
 * Returning `false` makes Auth.js redirect the request to the sign-in page, so
 * an unauthenticated (or un-refreshable) request never reaches a protected
 * route and never sees a bare 401.
 */
export function isAuthorized(auth: Session | null): boolean {
  return auth?.user != null && auth.error === undefined;
}

/** Builds the full Auth.js configuration. */
export function createAuthConfig(options: AuthOptions): NextAuthConfig {
  const refresh = createTokenRefresher({
    issuer: options.issuer,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });

  return {
    secret: options.secret,
    // No adapter and no database: the session lives entirely in the encrypted
    // cookie. `jwt` is Auth.js's default in that case, stated anyway because
    // the callbacks below only make sense under it.
    session: {
      strategy: 'jwt',
      ...(options.sessionMaxAgeSeconds === undefined
        ? {}
        : { maxAge: options.sessionMaxAgeSeconds }),
    },
    ...(options.signInPath === undefined ? {} : { pages: { signIn: options.signInPath } }),
    providers: [
      Okta({
        // Stated rather than left to Auth.js's `AUTH_OKTA_ID`/`AUTH_OKTA_SECRET`
        // environment inference: this project's variables are named
        // `AUTH_OKTA_CLIENT_ID`/`AUTH_OKTA_CLIENT_SECRET` and are validated in
        // one schema (`apps/web/src/env.ts`), so nothing should be read from
        // the environment behind that schema's back.
        id: OKTA_PROVIDER_ID,
        clientId: options.clientId,
        clientSecret: options.clientSecret,
        issuer: options.issuer,
        authorization: { params: { scope: OKTA_SCOPES } },
      }),
    ],
    callbacks: {
      jwt: ({ token, account }) => rotateAccessToken(token, account, refresh),
      session: ({ session, token }) => projectSession(session, token),
      authorized: ({ auth }) => isAuthorized(auth),
    },
  };
}
