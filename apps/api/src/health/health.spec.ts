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
 */

import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaService } from '../database/prisma.service';
import {
  DATABASE_HEALTH_TIMEOUT_MESSAGE,
  DatabaseHealthIndicator,
} from './database.health-indicator';
import { HEALTH_ROUTE_PREFIX, HealthController } from './health.controller';

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

async function createController(prisma: PrismaStub): Promise<HealthController> {
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

  describe('routing', () => {
    it('is mounted at /health, which main.ts excludes from the api prefix', () => {
      expect(HEALTH_ROUTE_PREFIX).toBe('health');
    });
  });

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
