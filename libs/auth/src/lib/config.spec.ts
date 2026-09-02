/**
 * The three callbacks that turn a one-hour Okta token into a working session,
 * and the configuration they hang off.
 *
 * The rotation tests below drive `createAuthConfig`'s **real** `jwt` callback,
 * with only `fetch` replaced — so the discovery request, the client
 * authentication and the token request are all genuinely made. Nothing here
 * branches on the environment: the same object is built for dev, e2e and
 * production, which is the rule the API side has to hold to as well.
 */

import type { Account, Session } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import {
  createAuthConfig,
  isAuthorized,
  OKTA_PROVIDER_ID,
  OKTA_SCOPES,
  projectSession,
  REFRESH_SKEW_SECONDS,
  REFRESH_TOKEN_ERROR,
  rotateAccessToken,
} from '../index';
import type { AuthOptions, TokenRefresher } from '../index';
import { discoveryDocument, stubFetch } from '../__fixtures__/stub-fetch';

const ISSUER = 'https://example.okta.test/oauth2/default';
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;

const OPTIONS: AuthOptions = {
  issuer: ISSUER,
  clientId: 'lets-park-web',
  clientSecret: 'super-secret',
  secret: 'a'.repeat(32),
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

const ACCOUNT: Account = {
  provider: OKTA_PROVIDER_ID,
  providerAccountId: 'okta-user-1',
  type: 'oidc',
  access_token: 'first-access-token',
  expires_at: nowSeconds() + 3600,
  refresh_token: 'first-refresh-token',
};

/** A refresher that always succeeds, and records that it was called. */
function succeedingRefresher(): TokenRefresher & { calls: string[] } {
  const calls: string[] = [];
  const refresh = async (refreshToken: string) => {
    calls.push(refreshToken);
    return {
      accessToken: 'renewed-access-token',
      expiresAt: nowSeconds() + 3600,
      refreshToken: 'renewed-refresh-token',
    };
  };
  return Object.assign(refresh, { calls });
}

/** A refresher that always fails, the way a revoked refresh token behaves. */
const failingRefresher: TokenRefresher = async () => {
  throw new Error('invalid_grant');
};

describe('rotateAccessToken (the jwt callback)', () => {
  describe('at sign-in', () => {
    it('stores the tokens the account carries', async () => {
      const token = await rotateAccessToken({}, ACCOUNT, succeedingRefresher());

      expect(token).toMatchObject({
        accessToken: 'first-access-token',
        expiresAt: ACCOUNT.expires_at,
        refreshToken: 'first-refresh-token',
      });
      expect(token.error).toBeUndefined();
    });

    it('clears a previous failure', async () => {
      const token = await rotateAccessToken(
        { error: REFRESH_TOKEN_ERROR },
        ACCOUNT,
        succeedingRefresher()
      );

      expect(token.error).toBeUndefined();
      expect(token.accessToken).toBe('first-access-token');
    });

    it('fails closed when the provider issued no access token', async () => {
      const { access_token: _accessToken, ...withoutToken } = ACCOUNT;

      const token = await rotateAccessToken({}, withoutToken, succeedingRefresher());

      expect(token.error).toBe(REFRESH_TOKEN_ERROR);
      expect(token.accessToken).toBeUndefined();
    });
  });

  describe('on a later request', () => {
    it('leaves a healthy token alone and does not call the provider', async () => {
      const refresher = succeedingRefresher();
      const healthy: JWT = {
        accessToken: 'still-good',
        expiresAt: nowSeconds() + 3600,
        refreshToken: 'r',
      };

      const token = await rotateAccessToken(healthy, null, refresher);

      expect(token).toBe(healthy);
      expect(refresher.calls).toEqual([]);
    });

    it('renews before the token expires, not after', async () => {
      const refresher = succeedingRefresher();
      // Still valid for another half minute — the API would accept it — but
      // inside the renewal skew, which is the whole point.
      const stillValidFor = REFRESH_SKEW_SECONDS - 30;
      const expiring: JWT = {
        accessToken: 'about-to-expire',
        expiresAt: nowSeconds() + stillValidFor,
        refreshToken: 'refresh-me',
      };

      const token = await rotateAccessToken(expiring, null, refresher);

      expect(refresher.calls).toEqual(['refresh-me']);
      expect(token.accessToken).toBe('renewed-access-token');
      expect(token.refreshToken).toBe('renewed-refresh-token');
      expect(token.error).toBeUndefined();
    });

    it('renews a token that has already expired', async () => {
      const refresher = succeedingRefresher();

      await rotateAccessToken(
        { accessToken: 'dead', expiresAt: nowSeconds() - 10, refreshToken: 'refresh-me' },
        null,
        refresher
      );

      expect(refresher.calls).toEqual(['refresh-me']);
    });

    it('drops the access token when the renewal fails', async () => {
      // Not a stale bearer: an absent Authorization header reads as
      // "unauthenticated", which the UI handles, whereas a dead token produces
      // a 401 indistinguishable from a bug.
      const token = await rotateAccessToken(
        { accessToken: 'dead', expiresAt: nowSeconds() - 10, refreshToken: 'revoked' },
        null,
        failingRefresher
      );

      expect(token.error).toBe(REFRESH_TOKEN_ERROR);
      expect(token.accessToken).toBeUndefined();
      expect(token.refreshToken).toBeUndefined();
    });

    it('fails closed when there is no refresh token to use', async () => {
      const refresher = succeedingRefresher();

      const token = await rotateAccessToken(
        { accessToken: 'dead', expiresAt: nowSeconds() - 10 },
        null,
        refresher
      );

      expect(token.error).toBe(REFRESH_TOKEN_ERROR);
      expect(refresher.calls).toEqual([]);
    });

    it('fails closed when the token has no expiry at all', async () => {
      const token = await rotateAccessToken(
        { accessToken: 'mystery', refreshToken: 'r' },
        null,
        succeedingRefresher()
      );

      expect(token.error).toBe(REFRESH_TOKEN_ERROR);
    });

    it('does not retry a session that already failed', async () => {
      const refresher = succeedingRefresher();
      const failed: JWT = { error: REFRESH_TOKEN_ERROR };

      const token = await rotateAccessToken(failed, null, refresher);

      expect(token).toBe(failed);
      expect(refresher.calls).toEqual([]);
    });
  });
});

describe('projectSession (the session callback)', () => {
  const session: Session = { user: { email: 'a@b.test' }, expires: '2099-01-01T00:00:00.000Z' };

  it('exposes the access token the transports need', () => {
    const projected = projectSession(session, { accessToken: 'bearer-me' });

    expect(projected.accessToken).toBe('bearer-me');
    expect(projected.error).toBeUndefined();
  });

  it('never exposes the refresh token', () => {
    const projected = projectSession(session, {
      accessToken: 'bearer-me',
      refreshToken: 'must-not-leave-the-server',
    });

    expect(JSON.stringify(projected)).not.toContain('must-not-leave-the-server');
  });

  it('reports a failed refresh and withholds the token', () => {
    const projected = projectSession(session, { error: REFRESH_TOKEN_ERROR });

    expect(projected.error).toBe(REFRESH_TOKEN_ERROR);
    expect(projected.accessToken).toBeUndefined();
  });

  it('cannot leave a stale token behind on a failed session', () => {
    const stale: Session = { ...session, accessToken: 'previously-issued' };

    const projected = projectSession(stale, { error: REFRESH_TOKEN_ERROR });

    expect(projected.accessToken).toBeUndefined();
  });

  it('keeps the identity fields Auth.js put there', () => {
    const projected = projectSession(session, { accessToken: 'bearer-me' });

    expect(projected.user?.email).toBe('a@b.test');
    expect(projected.expires).toBe(session.expires);
  });
});

describe('isAuthorized (the middleware callback)', () => {
  const authenticated: Session = {
    user: { email: 'a@b.test' },
    expires: '2099-01-01T00:00:00.000Z',
  };

  it('turns an unauthenticated request away', () => {
    // `false` is what makes Auth.js middleware redirect to the sign-in page
    // instead of letting the route answer with a bare 401.
    expect(isAuthorized(null)).toBe(false);
  });

  it('turns away a session whose refresh failed', () => {
    expect(isAuthorized({ ...authenticated, error: REFRESH_TOKEN_ERROR })).toBe(false);
  });

  it('lets a signed-in user through', () => {
    expect(isAuthorized(authenticated)).toBe(true);
  });
});

describe('createAuthConfig', () => {
  /**
   * `Okta({...})` returns `{ id, name, type, checks, style, options }` — the
   * caller's settings are parked under `options` and merged into the provider
   * by Auth.js at request time (`@auth/core/providers/okta.js`). Reading them
   * from there is what these assertions have to do; asserting them at the top
   * level would silently pass against `undefined`.
   */
  function oktaProvider(config: ReturnType<typeof createAuthConfig>) {
    return config.providers[0] as {
      id?: string;
      type?: string;
      checks?: readonly string[];
      options?: {
        id?: string;
        issuer?: string;
        clientId?: string;
        clientSecret?: string;
        authorization?: { params?: { scope?: string } };
      };
    };
  }

  it('registers exactly one Okta provider, under the id the callback URL uses', () => {
    const config = createAuthConfig(OPTIONS);
    const provider = oktaProvider(config);

    expect(config.providers).toHaveLength(1);
    expect(provider.type).toBe('oidc');
    // `/api/auth/callback/okta` is derived from this id — it is the URL that
    // has to be registered with Okta, so it is not free to drift.
    expect(provider.id).toBe(OKTA_PROVIDER_ID);
    expect(provider.options).toMatchObject({
      id: OKTA_PROVIDER_ID,
      issuer: ISSUER,
      clientId: OPTIONS.clientId,
      clientSecret: OPTIONS.clientSecret,
    });
  });

  it('keeps the PKCE and state checks the provider ships with', () => {
    expect(oktaProvider(createAuthConfig(OPTIONS)).checks).toEqual(['pkce', 'state']);
  });

  it('requests offline_access, without which Okta issues no refresh token', () => {
    const provider = oktaProvider(createAuthConfig(OPTIONS));

    expect(OKTA_SCOPES.split(' ')).toContain('offline_access');
    expect(provider.options?.authorization?.params?.scope).toBe(OKTA_SCOPES);
  });

  it('keeps the session in a JWT, since there is no database adapter', () => {
    expect(createAuthConfig(OPTIONS).session?.strategy).toBe('jwt');
    expect(createAuthConfig(OPTIONS).adapter).toBeUndefined();
  });

  it('takes the secret from its argument and reads no environment variable', () => {
    expect(createAuthConfig(OPTIONS).secret).toBe(OPTIONS.secret);
  });

  it('points at the application sign-in page only when one is given', () => {
    expect(createAuthConfig(OPTIONS).pages).toBeUndefined();
    expect(createAuthConfig({ ...OPTIONS, signInPath: '/prihlaseni' }).pages?.signIn).toBe(
      '/prihlaseni'
    );
  });

  it('renews an expiring token through a real discovery and token request', async () => {
    // End to end through the configured callback: only `fetch` is stubbed.
    const server = stubFetch((url) =>
      url === DISCOVERY_URL
        ? { body: discoveryDocument(ISSUER) }
        : { body: { access_token: 'renewed', expires_in: 3600 } }
    );
    const config = createAuthConfig({ ...OPTIONS, fetch: server.fetch });

    const token = await config.callbacks?.jwt?.({
      token: {
        accessToken: 'about-to-expire',
        expiresAt: nowSeconds() + (REFRESH_SKEW_SECONDS - 30),
        refreshToken: 'refresh-me',
      },
      user: {},
      account: null,
    });

    expect(server.calls.map((call) => call.url)).toEqual([DISCOVERY_URL, `${ISSUER}/token`]);
    expect(token).toMatchObject({ accessToken: 'renewed' });
  });

  it('reports a failed renewal on the session rather than swallowing it', async () => {
    const server = stubFetch((url) =>
      url === DISCOVERY_URL
        ? { body: discoveryDocument(ISSUER) }
        : { status: 400, body: { error: 'invalid_grant' } }
    );
    const config = createAuthConfig({ ...OPTIONS, fetch: server.fetch });

    const token = await config.callbacks?.jwt?.({
      token: {
        accessToken: 'dead',
        expiresAt: nowSeconds() - 10,
        refreshToken: 'revoked',
      },
      user: {},
      account: null,
    });

    expect(token).toMatchObject({ error: REFRESH_TOKEN_ERROR });

    /**
     * Auth.js types this parameter as the **intersection** of its two session
     * shapes — `{ user: AdapterUser } & AdapterSession & Session` — which no
     * runtime object can satisfy (`expires` would have to be `Date & string`).
     * Under `strategy: 'jwt'` only the `Session` half is ever passed. The cast
     * names that gap instead of papering over it; what is asserted below is
     * the behaviour, not the type.
     */
    type SessionCallbackParams = Parameters<
      NonNullable<NonNullable<typeof config.callbacks>['session']>
    >[0];
    const session = await config.callbacks?.session?.({
      session: { user: { email: 'a@b.test' }, expires: '2099-01-01T00:00:00.000Z' },
      token: token as JWT,
      newSession: undefined,
    } as unknown as SessionCallbackParams);

    expect(session).toMatchObject({ error: REFRESH_TOKEN_ERROR });
    // …and the middleware callback turns that into a redirect, not a 401.
    expect(isAuthorized(session as Session)).toBe(false);
  });
});
