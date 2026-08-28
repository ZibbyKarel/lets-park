/**
 * API bootstrap.
 *
 * Everything here needs the `INestApplication` itself, so it cannot live in
 * `AppModule`: the global prefix and its exclusions, helmet, CORS, body-size
 * limits, shutdown hooks and swapping Nest's default logger for pino. The
 * filter, the throttler guard and the logger *module* are wired in `AppModule`
 * so that tests get them too.
 *
 * Order matters in two places:
 *
 * - `bufferLogs: true` holds Nest's own startup lines until `useLogger` has
 *   installed pino, so the boot sequence is JSON like everything else instead
 *   of Nest's coloured text.
 * - `enableShutdownHooks()` is called **before** `listen()`, so a SIGTERM that
 *   arrives during startup is still handled.
 */

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app/app.module';
import { HEALTH_ROUTE_PREFIX } from './health/health.controller';
import type { ApiEnv } from './env';

/** Everything the API serves lives under `/api`, except the probes. */
const GLOBAL_PREFIX = 'api';

async function bootstrap(): Promise<void> {
  // `bodyParser: false` turns off Nest's own body parser so that the ones
  // registered below are the only ones. Left on, Nest would register a second
  // pair during `init()`; they would no-op behind ours, but only because ours
  // happen to run first — an ordering nobody should have to reason about.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });

  // From here on, every line Nest emits is a pino JSON record.
  app.useLogger(app.get(Logger));

  // `ConfigService` returns values already validated by `validateApiEnv` in
  // `AppModule` — a missing or malformed variable would have crashed the
  // process during `NestFactory.create` above, before reaching here.
  const configService = app.get(ConfigService<ApiEnv, true>);
  const port = configService.get('PORT', { infer: true });
  const bodyLimit = configService.get('BODY_LIMIT', { infer: true });
  const corsOrigins = configService.get('CORS_ALLOWED_ORIGINS', { infer: true });

  app.setGlobalPrefix(GLOBAL_PREFIX, {
    // Probes stay at `/health/live` and `/health/ready`. They are consumed by
    // an orchestrator, not by the API's clients, and burying them under the
    // application's own prefix couples a deployment probe path to a decision
    // about API routing.
    exclude: [`${HEALTH_ROUTE_PREFIX}/live`, `${HEALTH_ROUTE_PREFIX}/ready`],
  });

  app.use(helmet());

  // An explicit allow-list, never `origin: true` and never `*`: the API is
  // cookie/bearer authenticated, so a reflected origin is a CSRF surface.
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Payload limits. The default body-parser limit is 100kb, but it is set here
  // explicitly and from env so that it is visible and tunable rather than an
  // inherited default nobody knows about. An oversized body is rejected by
  // Express with 413 before any handler runs.
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));

  // Stop accepting connections on SIGTERM/SIGINT, let in-flight requests
  // finish, then run `onModuleDestroy` (closes the database pool) and
  // `onApplicationShutdown` (`GracefulShutdownService`, which Task 15 uses to
  // close Socket.io).
  app.enableShutdownHooks();

  await app.listen(port);

  app.get(Logger).log(`API listening on http://localhost:${port}/${GLOBAL_PREFIX}`, 'Bootstrap');
}

void bootstrap();
