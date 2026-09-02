/**
 * Signature verification against the issuer's JWKS — the reusable half of auth.
 *
 * The HTTP side reaches this through `JwtStrategy` (`passport-jwt` calls
 * {@link JwksVerifierService.getSigningKey} as its `secretOrKeyProvider`); the
 * Socket.io gateway in Task 15 cannot run a Passport HTTP strategy on a
 * handshake, so it calls {@link JwksVerifierService.verifyToken} directly. Both
 * paths share one `JwksClient` — one cache, one rate limiter, one rotation
 * behaviour — and one `jwtVerifyOptions`.
 *
 * ## Three properties this class is responsible for
 *
 * 1. **Nothing is trusted before the signature verifies.** The only part of an
 *    unverified token read here is the JOSE header (`kid`, `alg`), which is
 *    unavoidable: you cannot pick a key without knowing which key was claimed.
 *    The header is used to *look up* a key, never to decide anything. `alg` is
 *    checked against {@link ACCEPTED_JWT_ALGORITHMS} before a key is fetched,
 *    so `{"alg":"none"}` and an HMAC-with-the-public-key forgery are refused
 *    without touching the network (`jsonwebtoken` would refuse them again).
 * 2. **A cache miss is never an auth bypass.** Every failure path below throws.
 *    There is no branch that returns a token as valid because a key could not
 *    be fetched, and `cacheMaxAgeFallback` (jwks-rsa's "serve a stale key while
 *    the endpoint is down" option) is deliberately not enabled — see
 *    `doc/decision/0039-*`.
 * 3. **No secret or token is ever logged.** The log lines below carry a `kid`
 *    and an error message; the raw JWT is never passed to the logger, and
 *    `buildLoggerOptions` redacts `authorization` on the request side.
 *
 * ## Why discovery, not a hardcoded `/v1/keys`
 *
 * Okta serves its JWKS at `${issuer}/v1/keys`; `mock-oauth2-server` serves it
 * at `${issuer}/jwks`. A hardcoded suffix would work in exactly one of dev and
 * production, which would break the "same code, only the env value differs"
 * rule the moment it was deployed. The `jwks_uri` therefore comes from the
 * issuer's own OIDC discovery document, resolved **lazily** (a constructor
 * fetch would make module boot depend on the IdP being reachable) and cached
 * for the process lifetime.
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JwtHeader } from 'jsonwebtoken';
import * as jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as z from 'zod';
import type { ApiEnv } from '../env';
import type { JwtVerificationRules } from './jwt-verify-options';
import { ACCEPTED_JWT_ALGORITHMS, jwtVerifyOptions } from './jwt-verify-options';
import type { AuthTokenClaims } from './token-claims';
import { authTokenClaimsSchema } from './token-claims';

/** Path appended to the issuer to reach its OIDC discovery document (RFC 8414). */
export const OIDC_DISCOVERY_PATH = '/.well-known/openid-configuration';

/**
 * How long a fetch of the discovery document or the JWKS may take. Short on
 * purpose: an unreachable IdP must fail the request quickly rather than hold a
 * connection open until the client gives up.
 */
export const JWKS_REQUEST_TIMEOUT_MS = 5_000;

/**
 * How long a signing key is reused before it is fetched again.
 *
 * Rotation does **not** depend on this expiring. `jwks-rsa` memoises per `kid`
 * and does not cache failures, so a token signed with a *new* `kid` is a cache
 * miss and triggers an immediate refetch — a rotated key is picked up on the
 * first request that uses it, not up to ten minutes later. This TTL only bounds
 * how long a *withdrawn* key stays usable.
 */
export const JWKS_CACHE_MAX_AGE_MS = 600_000;

/** How many distinct `kid`s are kept. An issuer publishes a handful at most. */
export const JWKS_CACHE_MAX_ENTRIES = 5;

/**
 * Ceiling on JWKS fetches per minute.
 *
 * Because an unknown `kid` is a cache miss, an unauthenticated caller could
 * otherwise make the API hammer the IdP by presenting tokens with random `kid`s.
 * When the limit is hit `jwks-rsa` raises an error, so the request is rejected —
 * the failure mode is "some logins fail during a flood", never "a token is
 * accepted without a key".
 */
export const JWKS_REQUESTS_PER_MINUTE = 12;

/**
 * The two fields of the discovery document this application uses. Loose, like
 * every other document an external system owns: an issuer adding metadata must
 * not break authentication.
 */
const discoveryDocumentSchema = z.looseObject({
  issuer: z.string().min(1),
  jwks_uri: z.url(),
});

/** Trailing slashes are insignificant in a URL prefix; `iss` comparison is not. */
function withoutTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

@Injectable()
export class JwksVerifierService {
  private readonly issuer: string;
  private readonly verifyOptions: JwtVerificationRules;

  /**
   * Memoised client. `null` while unresolved *or* after a failed attempt: a
   * transient discovery outage must not leave every later request inheriting
   * one rejected promise.
   */
  private clientPromise: Promise<JwksClient> | null = null;

  constructor(
    configService: ConfigService<ApiEnv, true>,
    @InjectPinoLogger(JwksVerifierService.name) private readonly logger: PinoLogger
  ) {
    this.issuer = configService.get('AUTH_OKTA_ISSUER', { infer: true });
    this.verifyOptions = jwtVerifyOptions({
      AUTH_OKTA_ISSUER: this.issuer,
      AUTH_OKTA_AUDIENCE: configService.get('AUTH_OKTA_AUDIENCE', { infer: true }),
    });
  }

  /**
   * The options both verification paths use. Exposed so `JwtStrategy` can
   * spread the *same object* into its `passport-jwt` configuration instead of
   * rebuilding an equivalent one.
   */
  get options(): JwtVerificationRules {
    return this.verifyOptions;
  }

  /**
   * Resolves the PEM public key a raw token claims to be signed with.
   *
   * This is `passport-jwt`'s `secretOrKeyProvider` in method form. It rejects —
   * it never returns a fallback key — when the header is unreadable, the
   * algorithm is not allow-listed, the issuer is unreachable, or no published
   * key matches the `kid`.
   */
  async getSigningKey(rawToken: string): Promise<string> {
    const header = this.readHeader(rawToken);
    const client = await this.getClient();
    const key = await client.getSigningKey(header.kid);
    return key.getPublicKey();
  }

  /**
   * Verifies a raw token end to end and returns its parsed claims.
   *
   * Signature, issuer, audience and expiry are all checked here, by
   * `jsonwebtoken` against {@link options}. Task 15's Socket.io handshake calls
   * this; the HTTP path reaches the identical checks through `passport-jwt`,
   * which is handed the same options object.
   */
  async verifyToken(rawToken: string): Promise<AuthTokenClaims> {
    const key = await this.getSigningKey(rawToken);
    const payload = await new Promise<unknown>((resolve, reject) => {
      jwt.verify(rawToken, key, this.verifyOptions, (error, decoded) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(decoded);
      });
    });
    return authTokenClaimsSchema.parse(payload);
  }

  /**
   * Reads the JOSE header of an unverified token.
   *
   * `jwt.decode` performs no verification, which is why the only things taken
   * from its result are `kid` (a cache lookup key) and `alg` (checked against
   * the allow-list immediately). The payload is not read here at all.
   */
  private readHeader(rawToken: string): JwtHeader {
    const decoded = jwt.decode(rawToken, { complete: true });
    if (decoded === null) {
      throw new Error('The bearer token is not a well-formed JWT.');
    }
    const { header } = decoded;
    if (!(ACCEPTED_JWT_ALGORITHMS as readonly string[]).includes(header.alg)) {
      // Refused before a key is fetched. `alg: none` and `alg: HS256` (signed
      // with the public key an attacker downloaded from the JWKS endpoint) both
      // land here.
      throw new Error(`Unsupported token signature algorithm: ${header.alg}`);
    }
    return header;
  }

  private getClient(): Promise<JwksClient> {
    this.clientPromise ??= this.buildClient().catch((error: unknown) => {
      this.clientPromise = null;
      throw error;
    });
    return this.clientPromise;
  }

  private async buildClient(): Promise<JwksClient> {
    const jwksUri = await this.discoverJwksUri();
    this.logger.info({ jwksUri }, 'Resolved the issuer JWKS endpoint');
    return new JwksClient({
      jwksUri,
      cache: true,
      cacheMaxAge: JWKS_CACHE_MAX_AGE_MS,
      cacheMaxEntries: JWKS_CACHE_MAX_ENTRIES,
      rateLimit: true,
      jwksRequestsPerMinute: JWKS_REQUESTS_PER_MINUTE,
      timeout: JWKS_REQUEST_TIMEOUT_MS,
      // `cacheMaxAgeFallback` is intentionally unset: it keeps serving a stale
      // key while the JWKS endpoint is unreachable, which is precisely the
      // window in which a revoked key would still be trusted.
    });
  }

  /**
   * Fetches and validates the issuer's OIDC discovery document.
   *
   * Two checks beyond "it parsed", both of which matter:
   *
   * - the document's own `issuer` must equal the configured one, so a
   *   misconfigured `AUTH_OKTA_ISSUER` fails loudly at the first request
   *   instead of validating tokens against some other tenant's keys;
   * - `jwks_uri` must live on the same origin as the issuer, so a tampered or
   *   mistaken document cannot redirect key material to a third party.
   */
  private async discoverJwksUri(): Promise<string> {
    const discoveryUrl = `${withoutTrailingSlash(this.issuer)}${OIDC_DISCOVERY_PATH}`;
    const response = await fetch(discoveryUrl, {
      signal: AbortSignal.timeout(JWKS_REQUEST_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`OIDC discovery at ${discoveryUrl} answered HTTP ${response.status}.`);
    }

    const document = discoveryDocumentSchema.parse(await response.json());

    if (withoutTrailingSlash(document.issuer) !== withoutTrailingSlash(this.issuer)) {
      throw new Error(
        `OIDC discovery at ${discoveryUrl} declares issuer "${document.issuer}", ` +
          `which does not match AUTH_OKTA_ISSUER.`
      );
    }
    if (new URL(document.jwks_uri).origin !== new URL(this.issuer).origin) {
      throw new Error(
        `OIDC discovery at ${discoveryUrl} points jwks_uri at a different origin.`
      );
    }

    return document.jwks_uri;
  }
}
