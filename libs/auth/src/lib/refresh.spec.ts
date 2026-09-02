/**
 * What the refresher actually puts on the wire, and when.
 *
 * These tests import only `../index` — the wrapper's public entry point — and
 * never `next-auth`; the last test in this file reads its own source to keep
 * that true (same device as `libs/api-client/src/lib/api-client.spec.ts`).
 */

import { readFileSync } from 'node:fs';
import {
  createTokenRefresher,
  REFRESH_SKEW_SECONDS,
  shouldRefresh,
  TokenRefreshError,
} from '../index';
import { discoveryDocument, stubFetch } from '../__fixtures__/stub-fetch';

const ISSUER = 'https://example.okta.test/oauth2/default';
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;
const TOKEN_URL = `${ISSUER}/token`;
const CLIENT_ID = 'lets-park-web';
const CLIENT_SECRET = 'super-secret';
const REFRESH_TOKEN = 'refresh-token-value';

/** Unix seconds, as `expires_at` is expressed. */
const nowSeconds = () => Math.floor(Date.now() / 1000);

function tokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    access_token: 'new-access-token',
    expires_in: 3600,
    token_type: 'Bearer',
    ...overrides,
  };
}

/** Answers discovery, then every token request, with the canned bodies. */
function oidcServer(
  answer: Record<string, unknown> = tokenResponse(),
  status = 200,
  authMethods?: readonly string[]
) {
  return stubFetch((url) =>
    url === DISCOVERY_URL
      ? {
          body:
            authMethods === undefined
              ? discoveryDocument(ISSUER)
              : discoveryDocument(ISSUER, authMethods),
        }
      : { status, body: answer }
  );
}

function refresherFor(server: ReturnType<typeof oidcServer>) {
  return createTokenRefresher({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    fetch: server.fetch,
  });
}

describe('shouldRefresh', () => {
  it('leaves a token that is nowhere near expiry alone', () => {
    expect(shouldRefresh(nowSeconds() + 3600)).toBe(false);
  });

  it('renews while the token is still valid, not once it has expired', () => {
    // The whole point of the skew: at this instant the token is still good for
    // another half minute, and the API would accept it — but the request that
    // carries it has to travel, and the API compares against its own clock.
    const stillValidFor = 30;
    expect(stillValidFor).toBeLessThan(REFRESH_SKEW_SECONDS);
    expect(shouldRefresh(nowSeconds() + stillValidFor)).toBe(true);
  });

  it('renews a token that has already expired', () => {
    expect(shouldRefresh(nowSeconds() - 1)).toBe(true);
  });

  it('flips exactly one skew before expiry', () => {
    const nowMs = 1_700_000_000_000;
    const expiresAt = nowMs / 1000 + REFRESH_SKEW_SECONDS;

    expect(shouldRefresh(expiresAt, nowMs - 1)).toBe(false);
    expect(shouldRefresh(expiresAt, nowMs)).toBe(true);
  });
});

describe('createTokenRefresher', () => {
  it('discovers the token endpoint from the issuer instead of hard-coding it', async () => {
    const server = oidcServer();

    await refresherFor(server)(REFRESH_TOKEN);

    expect(server.calls[0]?.url).toBe(DISCOVERY_URL);
    expect(server.calls[0]?.method).toBe('GET');
    expect(server.calls[1]?.url).toBe(TOKEN_URL);
    expect(server.calls[1]?.method).toBe('POST');
  });

  it('tolerates a trailing slash on the issuer', async () => {
    const server = oidcServer();
    const refresh = createTokenRefresher({
      issuer: `${ISSUER}/`,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      fetch: server.fetch,
    });

    await refresh(REFRESH_TOKEN);

    expect(server.calls[0]?.url).toBe(DISCOVERY_URL);
  });

  it('fetches the discovery document once and reuses it', async () => {
    const server = oidcServer();
    const refresh = refresherFor(server);

    await refresh(REFRESH_TOKEN);
    await refresh(REFRESH_TOKEN);

    expect(server.calls.filter((call) => call.url === DISCOVERY_URL)).toHaveLength(1);
    expect(server.calls.filter((call) => call.url === TOKEN_URL)).toHaveLength(2);
  });

  it('does not cache a failed discovery', async () => {
    let discoveryAttempts = 0;
    const server = stubFetch((url) => {
      if (url === DISCOVERY_URL) {
        discoveryAttempts += 1;
        return discoveryAttempts === 1
          ? { status: 503, body: {} }
          : { body: discoveryDocument(ISSUER) };
      }
      return { body: tokenResponse() };
    });
    const refresh = refresherFor(server);

    await expect(refresh(REFRESH_TOKEN)).rejects.toBeInstanceOf(TokenRefreshError);
    await expect(refresh(REFRESH_TOKEN)).resolves.toMatchObject({
      accessToken: 'new-access-token',
    });
    expect(discoveryAttempts).toBe(2);
  });

  it('rejects a discovery document with no token endpoint', async () => {
    const server = stubFetch(() => ({ body: { issuer: ISSUER } }));

    await expect(refresherFor(server)(REFRESH_TOKEN)).rejects.toThrow(/token_endpoint/);
  });

  describe('client authentication', () => {
    it('uses HTTP Basic when the provider advertises client_secret_basic', async () => {
      const server = oidcServer(tokenResponse(), 200, ['client_secret_basic']);

      await refresherFor(server)(REFRESH_TOKEN);

      const token = server.calls[1];
      const expected = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
      expect(token?.headers.get('authorization')).toBe(`Basic ${expected}`);
      // The secret must not also be in the body — sending it twice is how a
      // strict authorization server answers `invalid_request`.
      expect(token?.body).not.toContain('client_secret');
    });

    it('falls back to the request body when only client_secret_post is advertised', async () => {
      const server = oidcServer(tokenResponse(), 200, ['client_secret_post']);

      await refresherFor(server)(REFRESH_TOKEN);

      const token = server.calls[1];
      expect(token?.headers.get('authorization')).toBeNull();
      const body = new URLSearchParams(token?.body ?? '');
      expect(body.get('client_id')).toBe(CLIENT_ID);
      expect(body.get('client_secret')).toBe(CLIENT_SECRET);
    });

    it('defaults to Basic when the document advertises nothing', async () => {
      const server = oidcServer(tokenResponse(), 200, []);

      await refresherFor(server)(REFRESH_TOKEN);

      expect(server.calls[1]?.headers.get('authorization')).toMatch(/^Basic /);
    });
  });

  it('sends the refresh_token grant', async () => {
    const server = oidcServer();

    await refresherFor(server)(REFRESH_TOKEN);

    const body = new URLSearchParams(server.calls[1]?.body ?? '');
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe(REFRESH_TOKEN);
    expect(server.calls[1]?.headers.get('content-type')).toBe('application/x-www-form-urlencoded');
  });

  it('turns expires_in into an absolute expiry', async () => {
    const server = oidcServer(tokenResponse({ expires_in: 300 }));
    const before = nowSeconds();

    const tokens = await refresherFor(server)(REFRESH_TOKEN);

    expect(tokens.expiresAt).toBeGreaterThanOrEqual(before + 300);
    expect(tokens.expiresAt).toBeLessThanOrEqual(nowSeconds() + 300);
  });

  it('stores a rotated refresh token when the provider issues one', async () => {
    const server = oidcServer(tokenResponse({ refresh_token: 'rotated' }));

    await expect(refresherFor(server)(REFRESH_TOKEN)).resolves.toMatchObject({
      refreshToken: 'rotated',
    });
  });

  it('keeps the old refresh token when the provider does not rotate', async () => {
    const server = oidcServer(tokenResponse());

    await expect(refresherFor(server)(REFRESH_TOKEN)).resolves.toMatchObject({
      refreshToken: REFRESH_TOKEN,
    });
  });

  describe('failures', () => {
    it('reports the status and the OAuth2 error code', async () => {
      const server = oidcServer(
        { error: 'invalid_grant', error_description: 'The refresh token is invalid' },
        400
      );

      await expect(refresherFor(server)(REFRESH_TOKEN)).rejects.toThrow(
        /HTTP 400 \(invalid_grant: The refresh token is invalid\)/
      );
    });

    it('never puts a token in the error message', async () => {
      // The provider echoing the credential back is exactly the case that turns
      // a "log the response body" shortcut into a leaked refresh token.
      const server = oidcServer(
        {
          error: 'invalid_grant',
          error_description: 'invalid',
          refresh_token: REFRESH_TOKEN,
          access_token: 'leaked-access-token',
        },
        400
      );

      const error = await refresherFor(server)(REFRESH_TOKEN).catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(TokenRefreshError);
      expect(String(error)).not.toContain(REFRESH_TOKEN);
      expect(String(error)).not.toContain('leaked-access-token');
    });

    it('survives an error body that is not JSON at all', async () => {
      const server = stubFetch((url) =>
        url === DISCOVERY_URL
          ? { body: discoveryDocument(ISSUER) }
          : { status: 502, raw: '<html>Bad Gateway</html>' }
      );

      await expect(refresherFor(server)(REFRESH_TOKEN)).rejects.toThrow(/HTTP 502/);
    });

    it('rejects a 200 response with no access token', async () => {
      const server = oidcServer({ expires_in: 3600 });

      await expect(refresherFor(server)(REFRESH_TOKEN)).rejects.toThrow(/access_token/);
    });

    it('rejects a 200 response with no usable expiry', async () => {
      const server = oidcServer({ access_token: 'a', expires_in: 'soon' });

      await expect(refresherFor(server)(REFRESH_TOKEN)).rejects.toThrow(/expires_in/);
    });
  });

  it('is exercised here without importing next-auth', () => {
    // `libs/auth` owns the `next-auth` import, but these tests are
    // application-shaped usage of the wrapper's own API; this pins that none of
    // it needed the wrapped package — a claim that would otherwise quietly stop
    // being true the first time someone reaches for an Auth.js type here.
    const source = readFileSync(__filename, 'utf8');

    expect(source).not.toMatch(/from\s+['"]next-auth/);
    expect(source).not.toMatch(/require\(\s*['"]next-auth/);
  });
});
