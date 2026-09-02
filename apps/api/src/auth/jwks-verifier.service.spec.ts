/**
 * `JwksVerifierService` against a **real** OIDC issuer.
 *
 * Every assertion here is about behaviour that a stubbed `JwksClient` would
 * have let pass regardless: discovery, signature checking, key rotation,
 * caching, and — the one that matters most — that an unreachable issuer fails
 * closed instead of falling through.
 *
 * The issuer is `testing/oidc-test-issuer.ts`, an in-process HTTP server that
 * publishes a discovery document and a JWKS of genuine RSA public keys. Docker
 * is unavailable here, so `mock-oauth2-server` itself could not be started;
 * this speaks the same protocol at the same two endpoints.
 */

import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { ApiEnv } from '../env';
import { JwksVerifierService } from './jwks-verifier.service';
import type { OidcTestIssuer, TestSigningKey } from './testing/oidc-test-issuer';
import { createSigningKey, startOidcTestIssuer } from './testing/oidc-test-issuer';
import { forgeUnsignedToken, signTestToken } from './testing/sign-test-token';

const AUDIENCE = 'api://default';

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as PinoLogger;

function verifierFor(issuer: string, audience = AUDIENCE): JwksVerifierService {
  const config = {
    get: (key: string) => (key === 'AUTH_OKTA_ISSUER' ? issuer : audience),
  } as unknown as ConfigService<ApiEnv, true>;
  return new JwksVerifierService(config, silentLogger);
}

describe('JwksVerifierService', () => {
  let issuer: OidcTestIssuer;
  let signingKey: TestSigningKey;

  beforeAll(() => {
    signingKey = createSigningKey('key-1');
  });

  beforeEach(async () => {
    issuer = await startOidcTestIssuer([signingKey]);
  });

  afterEach(async () => {
    await issuer.close();
  });

  describe('a valid token', () => {
    it('verifies and returns the parsed claims', async () => {
      const verifier = verifierFor(issuer.issuer);
      const token = signTestToken({
        key: signingKey,
        issuer: issuer.issuer,
        audience: AUDIENCE,
        subject: 'okta-1',
        email: 'alice@example.com',
        name: 'Alice',
      });

      await expect(verifier.verifyToken(token)).resolves.toMatchObject({
        sub: 'okta-1',
        email: 'alice@example.com',
        name: 'Alice',
      });
    });

    it('finds the JWKS through discovery, not through a guessed path', async () => {
      // The test issuer publishes at `/jwks`, Okta publishes at `/v1/keys`. A
      // hardcoded suffix in the implementation fails this test.
      const verifier = verifierFor(issuer.issuer);
      const token = signTestToken({
        key: signingKey,
        issuer: issuer.issuer,
        audience: AUDIENCE,
        subject: 'okta-1',
      });

      await verifier.verifyToken(token);

      expect(issuer.jwksRequestCount).toBeGreaterThan(0);
    });

    it('reuses the cached key instead of refetching per request', async () => {
      const verifier = verifierFor(issuer.issuer);
      const token = signTestToken({
        key: signingKey,
        issuer: issuer.issuer,
        audience: AUDIENCE,
        subject: 'okta-1',
      });

      await verifier.verifyToken(token);
      const afterFirst = issuer.jwksRequestCount;
      await verifier.verifyToken(token);
      await verifier.verifyToken(token);

      expect(issuer.jwksRequestCount).toBe(afterFirst);
    });
  });

  describe('rejections', () => {
    it.each([
      [
        'a token signed by a key the issuer never published',
        () =>
          signTestToken({
            key: { ...createSigningKey('impostor'), kid: signingKey.kid },
            issuer: issuer.issuer,
            audience: AUDIENCE,
            subject: 'okta-1',
          }),
      ],
      [
        'an expired token',
        () =>
          signTestToken({
            key: signingKey,
            issuer: issuer.issuer,
            audience: AUDIENCE,
            subject: 'okta-1',
            expiresInSeconds: -3600,
          }),
      ],
      [
        'a token from another issuer',
        () =>
          signTestToken({
            key: signingKey,
            issuer: 'https://evil.example/oauth2',
            audience: AUDIENCE,
            subject: 'okta-1',
          }),
      ],
      [
        'a token for another audience',
        () =>
          signTestToken({
            key: signingKey,
            issuer: issuer.issuer,
            audience: 'api://someone-else',
            subject: 'okta-1',
          }),
      ],
      [
        'an unsigned token claiming alg: none',
        () =>
          forgeUnsignedToken({
            sub: 'okta-1',
            iss: issuer.issuer,
            aud: AUDIENCE,
            exp: Math.floor(Date.now() / 1000) + 3600,
          }),
      ],
      ['a token with an unknown kid', () => signTestToken({
        key: signingKey,
        issuer: issuer.issuer,
        audience: AUDIENCE,
        subject: 'okta-1',
        kid: 'never-published',
      })],
      ['a string that is not a JWT at all', () => 'not.a.jwt'],
    ])('refuses %s', async (_name, mint) => {
      const verifier = verifierFor(issuer.issuer);

      await expect(verifier.verifyToken(mint())).rejects.toThrow();
    });

    it('refuses a token whose signature was stripped', async () => {
      const verifier = verifierFor(issuer.issuer);
      const token = signTestToken({
        key: signingKey,
        issuer: issuer.issuer,
        audience: AUDIENCE,
        subject: 'okta-1',
      });
      const [header, payload] = token.split('.');

      await expect(verifier.verifyToken(`${header}.${payload}.`)).rejects.toThrow();
    });

    it('refuses a token whose payload was edited after signing', async () => {
      const verifier = verifierFor(issuer.issuer);
      const token = signTestToken({
        key: signingKey,
        issuer: issuer.issuer,
        audience: AUDIENCE,
        subject: 'okta-1',
      });
      const [header, payload, signature] = token.split('.');
      const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()) as Record<
        string,
        unknown
      >;
      claims['sub'] = 'okta-admin';
      const tampered = `${header}.${Buffer.from(JSON.stringify(claims)).toString(
        'base64url'
      )}.${signature}`;

      await expect(verifier.verifyToken(tampered)).rejects.toThrow();
    });
  });

  describe('key rotation', () => {
    it('picks up a newly published key without a restart', async () => {
      const verifier = verifierFor(issuer.issuer);
      const oldToken = signTestToken({
        key: signingKey,
        issuer: issuer.issuer,
        audience: AUDIENCE,
        subject: 'okta-1',
      });
      await verifier.verifyToken(oldToken);

      const rotated = createSigningKey('key-2');
      issuer.publish([signingKey, rotated]);
      const newToken = signTestToken({
        key: rotated,
        issuer: issuer.issuer,
        audience: AUDIENCE,
        subject: 'okta-1',
      });

      // The new `kid` is a cache miss, which forces a refetch — rotation does
      // not wait for the ten-minute TTL.
      await expect(verifier.verifyToken(newToken)).resolves.toMatchObject({ sub: 'okta-1' });
    });

    it('stops accepting a key that was withdrawn and never cached', async () => {
      const verifier = verifierFor(issuer.issuer);
      const withdrawn = createSigningKey('key-old');
      issuer.publish([signingKey]);

      const token = signTestToken({
        key: withdrawn,
        issuer: issuer.issuer,
        audience: AUDIENCE,
        subject: 'okta-1',
      });

      await expect(verifier.verifyToken(token)).rejects.toThrow();
    });
  });

  describe('an unreachable issuer', () => {
    it('fails closed rather than accepting the token', async () => {
      const verifier = verifierFor(issuer.issuer);
      issuer.setAvailable(false);
      const token = signTestToken({
        key: signingKey,
        issuer: issuer.issuer,
        audience: AUDIENCE,
        subject: 'okta-1',
      });

      await expect(verifier.verifyToken(token)).rejects.toThrow();
    });

    it('recovers once the issuer comes back — a failed discovery is not permanent', async () => {
      const verifier = verifierFor(issuer.issuer);
      issuer.setAvailable(false);
      const token = signTestToken({
        key: signingKey,
        issuer: issuer.issuer,
        audience: AUDIENCE,
        subject: 'okta-1',
      });
      await expect(verifier.verifyToken(token)).rejects.toThrow();

      issuer.setAvailable(true);

      // Without dropping the memoised rejection, every later request would
      // inherit the first failure for the lifetime of the process.
      await expect(verifier.verifyToken(token)).resolves.toMatchObject({ sub: 'okta-1' });
    });
  });

  describe('discovery hardening', () => {
    it('refuses a document that declares a different issuer', async () => {
      // `AUTH_OKTA_ISSUER` pointed at the wrong tenant: the document answers,
      // but names somebody else. Trusting it would validate tokens against
      // another org's keys.
      issuer.overrideDiscovery({ issuer: 'https://someone-else.okta.com/oauth2/default' });
      const verifier = verifierFor(issuer.issuer);
      const token = signTestToken({
        key: signingKey,
        issuer: issuer.issuer,
        audience: AUDIENCE,
        subject: 'okta-1',
      });

      await expect(verifier.verifyToken(token)).rejects.toThrow(/does not match AUTH_OKTA_ISSUER/);
    });

    it('refuses a document that points jwks_uri at another origin', async () => {
      issuer.overrideDiscovery({ jwks_uri: 'https://evil.example/jwks' });
      const verifier = verifierFor(issuer.issuer);
      const token = signTestToken({
        key: signingKey,
        issuer: issuer.issuer,
        audience: AUDIENCE,
        subject: 'okta-1',
      });

      await expect(verifier.verifyToken(token)).rejects.toThrow(/different origin/);
    });

    it('tolerates a trailing slash on the configured issuer', async () => {
      const verifier = verifierFor(`${issuer.issuer}/`);
      const token = signTestToken({
        key: signingKey,
        issuer: `${issuer.issuer}/`,
        audience: AUDIENCE,
        subject: 'okta-1',
      });

      await expect(verifier.verifyToken(token)).resolves.toMatchObject({ sub: 'okta-1' });
    });
  });
});
