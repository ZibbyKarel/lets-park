/**
 * Health endpoints.
 *
 * These exercise the real `HealthCheckService` and the real
 * `DatabaseHealthIndicator` against a `PrismaService` double, because the
 * property under test is the *difference* between liveness and readiness: with
 * the database down, `/health/live` must still say the process is fine while
 * `/health/ready` must fail. A readiness probe that passes while Postgres is
 * down makes a broken deploy look healthy.
 *
 * Docker is not available in this environment, so the database is a stub. The
 * query it stands in for is a genuine `SELECT 1` (`PrismaService.ping`), and it
 * is asserted here that readiness calls it exactly once per probe.
 *
 * **Scope.** These call the controller directly, so they establish what the
 * indicator and the controller *compute* — how often the database is touched,
 * what the timeout does, what the reason says. They deliberately do **not**
 * claim anything about the HTTP response: review found that the global filter
 * was overwriting the payload asserted here, and a controller-level test cannot
 * see that. The response an orchestrator actually receives is asserted in
 * `apps/api/src/app/http-pipeline.spec.ts`, against a running server.
 */

import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';
import { getLoggerToken } from 'nestjs-pino';
import type { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../database/prisma.service';
import {
  DATABASE_HEALTH_TIMEOUT_MESSAGE,
  DatabaseHealthIndicator,
} from './database.health-indicator';
import { HealthController } from './health.controller';

const HEALTH_DB_TIMEOUT_MS = 50;

class PrismaStub {
  pings = 0;
  behaviour: 'up' | 'down' | 'hang' = 'up';

  async ping(): Promise<void> {
    this.pings += 1;
    if (this.behaviour === 'down') {
      throw new Error('connect ECONNREFUSED 10.0.0.7:5432 for user "lets_park"');
    }
    if (this.behaviour === 'hang') {
      await new Promise<void>(() => {
        /* never settles — a full pool or a network black hole */
      });
    }
  }
}

/**
 * What the indicator wrote to the log, in the order it wrote it.
 *
 * Kept as a recording double rather than a spy on a real pino instance so the
 * assertions can read the *bindings object* — the `err` the response is
 * forbidden to carry has to be provably present here, and a serialized log
 * line would only prove that some string contains the host.
 */
interface LogLine {
  readonly bindings: Record<string, unknown>;
  readonly message: string;
}

function recordingLogger(): { logger: PinoLogger; lines: LogLine[] } {
  const lines: LogLine[] = [];
  const record =
    () =>
    (bindings: Record<string, unknown>, message: string): void => {
      lines.push({ bindings, message });
    };

  return {
    lines,
    logger: {
      trace: record(),
      debug: record(),
      info: record(),
      warn: record(),
      error: record(),
      fatal: record(),
    } as unknown as PinoLogger,
  };
}

async function createController(
  prisma: PrismaStub,
  logger: PinoLogger = recordingLogger().logger
): Promise<HealthController> {
  const moduleRef = await Test.createTestingModule({
    imports: [TerminusModule.forRoot({ errorLogStyle: 'json', logger: false })],
    controllers: [HealthController],
    providers: [
      DatabaseHealthIndicator,
      { provide: PrismaService, useValue: prisma },
      {
        provide: ConfigService,
        useValue: { get: () => HEALTH_DB_TIMEOUT_MS },
      },
      { provide: getLoggerToken(DatabaseHealthIndicator.name), useValue: logger },
    ],
  }).compile();

  return moduleRef.get(HealthController);
}

describe('HealthController', () => {
  let prisma: PrismaStub;
  let controller: HealthController;

  beforeEach(async () => {
    prisma = new PrismaStub();
    controller = await createController(prisma);
  });

  // Routing is not asserted here. `expect(HEALTH_ROUTE_PREFIX).toBe('health')`
  // would only check a literal against itself; that the probes really answer
  // outside the `/api` prefix is proved by request in `http-pipeline.spec.ts`.

  describe('/health/live', () => {
    it('reports ok', async () => {
      await expect(controller.live()).resolves.toMatchObject({ status: 'ok' });
    });

    it('does not touch the database — a database outage must not restart the process', async () => {
      prisma.behaviour = 'down';

      await expect(controller.live()).resolves.toMatchObject({ status: 'ok' });
      expect(prisma.pings).toBe(0);
    });
  });

  describe('/health/ready', () => {
    it('reports ok and reaches the database exactly once', async () => {
      const result = await controller.ready();

      expect(result.status).toBe('ok');
      expect(result.details['database']).toMatchObject({ status: 'up' });
      expect(prisma.pings).toBe(1);
    });

    it('fails with 503 when the database is unreachable', async () => {
      prisma.behaviour = 'down';

      // Terminus signals a failed check by throwing 503 — that is what makes
      // an orchestrator take the instance out of rotation.
      const failure = await controller.ready().catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      const response = (failure as ServiceUnavailableException).getResponse() as {
        status: string;
        details: Record<string, { status: string; reason?: string }>;
      };
      expect(response.status).toBe('error');
      expect(response.details['database']).toMatchObject({
        status: 'down',
        reason: 'Database is unreachable',
      });
    });

    it('does not leak the driver error — it can carry host, database and user', async () => {
      prisma.behaviour = 'down';

      const failure = await controller.ready().catch((error: unknown) => error);
      const serialized = JSON.stringify((failure as ServiceUnavailableException).getResponse());

      expect(serialized).not.toContain('10.0.0.7');
      expect(serialized).not.toContain('lets_park');
    });

    it('logs the driver error it refuses to put in the response', async () => {
      // The two halves of this pair say deliberately different things. The
      // response must not name the host, the database or the user; the log is
      // the only place an operator can tell a rotated password from DNS from
      // an exhausted pool, and without it a crash loop has one symptom and
      // three possible fixes.
      const recorder = recordingLogger();
      prisma.behaviour = 'down';
      controller = await createController(prisma, recorder.logger);

      await controller.ready().catch(() => undefined);

      expect(recorder.lines).toHaveLength(1);
      const line = recorder.lines[0];
      expect(line?.message).toBe('Readiness database probe failed');
      expect(line?.bindings['err']).toBeInstanceOf(Error);
      // The cause the response is forbidden to carry survives here, in full.
      expect((line?.bindings['err'] as Error).message).toContain('10.0.0.7');
      expect((line?.bindings['err'] as Error).message).toContain('lets_park');
    });

    it('says nothing when the probe succeeds — a healthy probe is not a log line', async () => {
      const recorder = recordingLogger();
      controller = await createController(prisma, recorder.logger);

      await controller.ready();

      expect(recorder.lines).toHaveLength(0);
    });

    it('logs the timeout too, so a hung pool is distinguishable in the logs', async () => {
      const recorder = recordingLogger();
      prisma.behaviour = 'hang';
      controller = await createController(prisma, recorder.logger);

      await controller.ready().catch(() => undefined);

      expect(recorder.lines).toHaveLength(1);
      expect((recorder.lines[0]?.bindings['err'] as Error).message).toBe(
        DATABASE_HEALTH_TIMEOUT_MESSAGE
      );
    });

    it('fails fast instead of hanging when the database never answers', async () => {
      prisma.behaviour = 'hang';

      const startedAt = Date.now();
      const failure = await controller.ready().catch((error: unknown) => error);
      const elapsed = Date.now() - startedAt;

      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      const response = (failure as ServiceUnavailableException).getResponse() as {
        details: Record<string, { reason?: string }>;
      };
      expect(response.details['database']?.reason).toBe(DATABASE_HEALTH_TIMEOUT_MESSAGE);
      // A hanging probe reads as "still starting" to most orchestrators, which
      // is the wrong answer; it has to fail inside the configured window.
      expect(elapsed).toBeLessThan(HEALTH_DB_TIMEOUT_MS * 10);
    });
  });
});
