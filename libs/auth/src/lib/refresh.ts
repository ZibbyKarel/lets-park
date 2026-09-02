/**
 * Refresh token rotation against the OIDC provider.
 *
 * Auth.js renews nothing on its own: once the OAuth2 callback has run, the
 * access token in the session cookie ages out and the API starts rejecting it.
 * This module is the half of the `jwt` callback that talks to Okta — kept
 * separate from `config.ts` so the network shape (discovery, client
 * authentication, error mapping) can be exercised without constructing an
 * Auth.js instance.
 *
 * The token endpoint is **discovered**, not configured. `AUTH_OKTA_ISSUER` is
 * the only Okta URL in the environment (`.env.example`, `apps/web/src/env.ts`),
 * and the same variable drives the API's JWKS lookup — pointing both at
 * `mock-oauth2-server` in dev/e2e and at the real org in production, with no
 * code change and no test-only branch.
 */

/**
 * How long before expiry a token is considered due for renewal, in seconds.
 *
 * Renewing exactly at `exp` guarantees a race: the request that carries the
 * token still has to travel, and the API compares against its own clock. A
 * minute is enough to cover both, and short enough that a token is never held
 * far past its useful life.
 */
export const REFRESH_SKEW_SECONDS = 60;

/**
 * Whether an access token expiring at `expiresAt` (unix seconds) should be
 * renewed now.
 *
 * Pure and exported so the "renew *before* expiry" rule is a fact a test can
 * check, rather than an inequality buried in a callback.
 */
export function shouldRefresh(expiresAt: number, nowMs: number = Date.now()): boolean {
  return nowMs >= (expiresAt - REFRESH_SKEW_SECONDS) * 1000;
}

/** The subset of the OIDC discovery document this module reads. */
interface DiscoveryDocument {
  readonly token_endpoint?: unknown;
  readonly token_endpoint_auth_methods_supported?: unknown;
}

/** A renewed set of tokens, in this project's camelCase. */
export interface RefreshedTokens {
  readonly accessToken: string;
  /** Unix seconds. */
  readonly expiresAt: number;
  /**
   * The refresh token to store for next time. Okta rotates refresh tokens when
   * the app is configured to, and returns nothing when it is not — in which
   * case this is the token that was sent, so the caller can store it
   * unconditionally.
   */
  readonly refreshToken: string;
}

export interface TokenRefresherOptions {
  /** OIDC issuer, e.g. `https://example.okta.com/oauth2/default`. */
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret: string;
  /** Override the `fetch` used for discovery and the token request. */
  readonly fetch?: typeof globalThis.fetch;
}

/** Renews an access token from a refresh token. */
export type TokenRefresher = (refreshToken: string) => Promise<RefreshedTokens>;

/**
 * Thrown when renewal fails.
 *
 * The message carries only the HTTP status and the OAuth2 `error` /
 * `error_description` fields — never the response body, and never a token.
 * A token endpoint's error body is small and well specified; dumping it
 * wholesale is how a refresh token ends up in a log file.
 */
export class TokenRefreshError extends Error {
  override readonly name = 'TokenRefreshError';
}

/** `${issuer}/.well-known/openid-configuration`, tolerating a trailing slash. */
function discoveryUrl(issuer: string): string {
  return `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`;
}

function readErrorFields(body: unknown): string {
  if (typeof body !== 'object' || body === null) return '';
  const { error, error_description: description } = body as Record<string, unknown>;
  const parts = [
    typeof error === 'string' ? error : undefined,
    typeof description === 'string' ? description : undefined,
  ].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? ` (${parts.join(': ')})` : '';
}

/**
 * Reads the response body as JSON, or `undefined` if it is not JSON at all.
 * Used only on the error path, where an HTML error page from a proxy is a
 * realistic possibility and must not turn into a second, confusing failure.
 */
async function readJsonOrUndefined(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * Builds a refresher bound to one issuer and client.
 *
 * The discovery document is fetched at most once per refresher — the *promise*
 * is cached, so concurrent renewals share a single request — and the cache is
 * per instance rather than module-global. That is deliberate: a module-global
 * cache would need a reset hook to be testable, and a reset hook that only
 * tests call is exactly the kind of production-code test seam this project
 * bans elsewhere.
 *
 * The token request is coalesced the same way: concurrent callers presenting
 * the same refresh token share one grant, which is what stops a rotating
 * authorization server from invalidating the token under its own siblings. See
 * the comment on the returned function and `doc/decision/0051-*`.
 */
export function createTokenRefresher(options: TokenRefresherOptions): TokenRefresher {
  const { issuer, clientId, clientSecret } = options;
  const fetchImpl = options.fetch ?? globalThis.fetch;

  let discovery: Promise<{ tokenEndpoint: string; useBasicAuth: boolean }> | undefined;

  async function discover(): Promise<{ tokenEndpoint: string; useBasicAuth: boolean }> {
    const url = discoveryUrl(issuer);
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new TokenRefreshError(`OIDC discovery at ${url} failed with HTTP ${response.status}.`);
    }
    const document = (await response.json()) as DiscoveryDocument;
    const tokenEndpoint = document.token_endpoint;
    if (typeof tokenEndpoint !== 'string' || tokenEndpoint === '') {
      throw new TokenRefreshError(`OIDC discovery at ${url} returned no usable "token_endpoint".`);
    }

    // Okta registers web apps with `client_secret_basic` by default, while the
    // Auth.js refresh-rotation guide hard-codes `client_secret_post` (which is
    // what Google wants). Reading the advertised methods instead of picking one
    // is what makes the same code work against both the real org and
    // `mock-oauth2-server`. When the document says nothing, `client_secret_basic`
    // is the OIDC default for a confidential client.
    const methods = document.token_endpoint_auth_methods_supported;
    const supported = Array.isArray(methods)
      ? methods.filter((method): method is string => typeof method === 'string')
      : [];
    const useBasicAuth =
      supported.length === 0
        ? true
        : supported.includes('client_secret_basic') || !supported.includes('client_secret_post');

    return { tokenEndpoint, useBasicAuth };
  }

  async function exchange(refreshToken: string): Promise<RefreshedTokens> {
    discovery ??= discover();
    let endpoint: { tokenEndpoint: string; useBasicAuth: boolean };
    try {
      endpoint = await discovery;
    } catch (error) {
      // A failed discovery must not poison the refresher forever — the next
      // renewal (minutes later) gets a fresh attempt.
      discovery = undefined;
      throw error;
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    const headers: Record<string, string> = {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    };
    if (endpoint.useBasicAuth) {
      // RFC 6749 §2.3.1: client id and secret are form-urlencoded before being
      // base64'd, which matters as soon as a secret contains `+` or `/`.
      const credentials = `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`;
      headers.authorization = `Basic ${Buffer.from(credentials).toString('base64')}`;
    } else {
      body.set('client_id', clientId);
      body.set('client_secret', clientSecret);
    }

    const response = await fetchImpl(endpoint.tokenEndpoint, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const details = readErrorFields(await readJsonOrUndefined(response));
      throw new TokenRefreshError(`Token refresh failed with HTTP ${response.status}${details}.`);
    }

    const tokens = (await response.json()) as Record<string, unknown>;
    const accessToken = tokens['access_token'];
    const expiresIn = tokens['expires_in'];
    if (typeof accessToken !== 'string' || accessToken === '') {
      throw new TokenRefreshError('Token refresh returned no "access_token".');
    }
    if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn)) {
      throw new TokenRefreshError('Token refresh returned no usable "expires_in".');
    }
    const rotated = tokens['refresh_token'];

    return {
      accessToken,
      expiresAt: Math.floor(Date.now() / 1000 + expiresIn),
      // Okta only returns a new refresh token when rotation is enabled on the
      // authorization server; keeping the old one otherwise is what stops the
      // *next* renewal from failing with `invalid_grant`.
      refreshToken: typeof rotated === 'string' && rotated !== '' ? rotated : refreshToken,
    };
  }

  /**
   * The renewal currently on the wire, if any, keyed by the refresh token that
   * started it. Cleared as soon as it settles — this coalesces concurrent
   * callers, it does not cache a result.
   */
  let inFlight: { refreshToken: string; result: Promise<RefreshedTokens> } | undefined;

  return function refresh(refreshToken: string): Promise<RefreshedTokens> {
    // Several requests can read the session inside the same renewal window — a
    // page whose layout, Server Component and Route Handler each `await auth()`
    // is three. With refresh-token rotation enabled on the authorization
    // server, the first grant invalidates the token and the rest come back
    // `invalid_grant`, which fails the session closed and signs the user out
    // mid-session. Sharing one in-flight request removes that for callers in
    // this process, which is all of them on a single-instance deployment.
    // Residual races and the multi-process case: `doc/decision/0051-*`.
    if (inFlight?.refreshToken === refreshToken) return inFlight.result;

    const result = exchange(refreshToken);
    const entry = { refreshToken, result };
    inFlight = entry;

    // Cleared only if this is still the current entry, so a slow failure cannot
    // wipe a newer renewal's slot. `.then(f, f)` handles the rejection on this
    // derived promise; the original is still returned to the caller, which is
    // what reports the error.
    const clear = () => {
      if (inFlight === entry) inFlight = undefined;
    };
    result.then(clear, clear);

    return result;
  };
}
