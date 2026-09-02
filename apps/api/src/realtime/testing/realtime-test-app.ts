/**
 * The assembled application, listening, with a real issuer and a real socket
 * server — the harness the realtime specs drive.
 *
 * Same shape as `auth/auth-pipeline.spec.ts`'s setup and for the same reason:
 * the claims worth making about the gateway are properties of a composition
 * (engine.io → socket.io → Nest's `IoAdapter` → this gateway →
 * `JwksVerifierService` → `jsonwebtoken` → `AuthUserService`), and no unit test
 * that calls `handleConnection` directly can see any of them.
 *
 * **Nothing here is a test backdoor.** The module under test is the real
 * `AppModule` and the socket server is the one `configureApp` builds. Three
 * environment *values* differ from production and no code path does:
 *
 * - `AUTH_OKTA_ISSUER` points at an in-process OIDC server instead of Okta —
 *   exactly as dev and e2e point it at `mock-oauth2-server`;
 * - `REALTIME_LOCK_TTL_MS` is short, so a suite can watch a hold lapse without
 *   waiting 30 s;
 * - `DATABASE_URL` is present but unused, because `PrismaService` is replaced
 *   by `PrismaDouble` (Docker is not available to `api:test`).
 *
 * Spec-only support code, excluded from `tsconfig.app.json`.
 */

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModuleBuilder } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { PARAMS_PROVIDER_TOKEN } from 'nestjs-pino';
import type { Params } from 'nestjs-pino';
import type { Options } from 'pino-http';
import type { OidcTestIssuer, TestSigningKey } from '../../auth/testing/oidc-test-issuer';
import { createSigningKey, startOidcTestIssuer } from '../../auth/testing/oidc-test-issuer';
import { configureApp } from '../../configure-app';
import { PrismaService } from '../../database/prisma.service';
import { buildLoggerOptions } from '../../logging/logger.options';
import { PrismaDouble } from '../../testing/prisma-double';
import { signTestToken } from '../../auth/testing/sign-test-token';

export const AUDIENCE = 'api://default';
export const ALLOWED_ORIGIN = 'http://localhost:4200';

export interface RealtimeTestAppOptions {
  /** `REALTIME_LOCK_TTL_MS`. Short by default so a suite can watch a hold lapse. */
  readonly lockTtlMs?: number;
  /** `LOG_LEVEL`. `fatal` unless a spec is reading log output. */
  readonly logLevel?: string;
  /** Receives every line pino emits, if a spec asked for a level that emits any. */
  readonly onLogLine?: (line: string) => void;
}

export interface RealtimeTestApp {
  readonly app: INestApplication;
  readonly baseUrl: string;
  readonly issuer: OidcTestIssuer;
  readonly double: PrismaDouble;
  /** Mints a token this API should accept, unless an option is deliberately wrong. */
  tokenFor(options: { subject: string; email?: string; name?: string; expiresInSeconds?: number }): string;
  /** Mints a token signed by a key the issuer never published. */
  tokenFromAnImpostor(subject: string): string;
  close(): Promise<void>;
}

/**
 * Boots the app.
 *
 * `process.env` is written before `AppModule` is imported, because
 * `ConfigModule.forRoot({ validate })` runs at import time — the same mechanism
 * `auth-pipeline.spec.ts` documents.
 */
export async function startRealtimeTestApp(
  options: RealtimeTestAppOptions = {}
): Promise<RealtimeTestApp> {
  const signingKey = createSigningKey('key-1');
  const issuer = await startOidcTestIssuer([signingKey]);
  const double = new PrismaDouble();

  Object.assign(process.env, {
    NODE_ENV: 'test',
    PORT: '3000',
    DATABASE_URL: 'postgresql://lets_park:lets_park@localhost:5432/lets_park',
    AUTH_OKTA_ISSUER: issuer.issuer,
    AUTH_OKTA_AUDIENCE: AUDIENCE,
    CORS_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
    LOG_LEVEL: options.logLevel ?? 'fatal',
    THROTTLE_LIMIT: '100000',
    THROTTLE_STRICT_LIMIT: '100000',
    REALTIME_LOCK_TTL_MS: String(options.lockTtlMs ?? 1_000),
  });
  const { AppModule } = await import('../../app/app.module');

  let builder: TestingModuleBuilder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({
      ...double.asPrismaService(),
      ping: jest.fn(),
      onModuleInit: jest.fn(),
      onModuleDestroy: jest.fn(),
    });

  if (options.onLogLine !== undefined) {
    // The real options the running server uses, with a destination attached —
    // the `calendar-logging.spec.ts` pattern. Nothing about redaction is
    // configured here; a spec that configured it would be testing its own setup.
    const emit = options.onLogLine;
    const loggerOptions = buildLoggerOptions({
      LOG_LEVEL: (options.logLevel ?? 'debug') as never,
      NODE_ENV: 'test',
    });
    const params: Params = {
      ...loggerOptions,
      pinoHttp: [
        loggerOptions.pinoHttp as Options,
        {
          write(chunk: string) {
            emit(String(chunk));
          },
        },
      ],
    };
    builder = builder.overrideProvider(PARAMS_PROVIDER_TOKEN).useValue(params);
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ bodyParser: false });
  configureApp(app, { BODY_LIMIT: '100kb', CORS_ALLOWED_ORIGINS: [ALLOWED_ORIGIN] });
  await app.init();
  await app.listen(0);
  const baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;

  return {
    app,
    baseUrl,
    issuer,
    double,
    tokenFor: (tokenOptions) =>
      signTestToken({ key: signingKey, issuer: issuer.issuer, audience: AUDIENCE, ...tokenOptions }),
    tokenFromAnImpostor: (subject) =>
      signTestToken({
        // A different key pair published under the *same* `kid`, so the lookup
        // succeeds and the signature check is what refuses it.
        key: { ...createSigningKey('impostor'), kid: signingKey.kid },
        issuer: issuer.issuer,
        audience: AUDIENCE,
        subject,
      }),
    close: async () => {
      await app.close();
      await issuer.close();
    },
  };
}

/** A `UserSummary`-shaped seed, so a spec can assert on what a broadcast carried. */
export function seedEmployee(
  double: PrismaDouble,
  seed: { oktaId: string; name: string; licensePlate?: string | null }
): { id: string; name: string; licensePlate: string | null; oktaId: string } {
  const row = double.seedUser({
    oktaId: seed.oktaId,
    email: `${seed.oktaId}@example.test`,
    name: seed.name,
    licensePlate: seed.licensePlate ?? null,
  });
  return { id: row.id, name: row.name, licensePlate: row.licensePlate, oktaId: row.oktaId };
}
