/**
 * The readiness check that actually reaches Postgres.
 *
 * A readiness probe that returns 200 while the database is down is worse than
 * no probe at all: it makes a broken deploy look healthy and lets the
 * orchestrator route traffic to an instance that can only produce 500s. So this
 * indicator issues a real `SELECT 1`.
 *
 * It is wrapped in a timeout because a *hung* Postgres — a full connection
 * pool, a network black hole — makes `SELECT 1` never settle. Without the
 * timeout the probe would hang instead of failing, and a hanging probe reads to
 * most orchestrators as "still starting", not "broken".
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HealthIndicatorResult } from '@nestjs/terminus';
import { HealthIndicatorService } from '@nestjs/terminus';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../database/prisma.service';
import type { ApiEnv } from '../env';

/** Rejects with this message when the ping outlives `HEALTH_DB_TIMEOUT_MS`. */
export const DATABASE_HEALTH_TIMEOUT_MESSAGE = 'Database did not respond in time';

@Injectable()
export class DatabaseHealthIndicator {
  private readonly timeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly healthIndicatorService: HealthIndicatorService,
    configService: ConfigService<ApiEnv, true>,
    @InjectPinoLogger(DatabaseHealthIndicator.name) private readonly logger: PinoLogger
  ) {
    this.timeoutMs = configService.get('HEALTH_DB_TIMEOUT_MS', { infer: true });
  }

  async isHealthy(key = 'database'): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    const startedAt = Date.now();

    try {
      await this.withTimeout(this.prisma.ping());
      return indicator.up({ responseTimeMs: Date.now() - startedAt });
    } catch (error) {
      // The log is where the *cause* survives. The coarse `reason` below tells
      // an operator that the database is unreachable and nothing more, so
      // without this line a rotated password (`28P01`), a host that no longer
      // resolves and an exhausted pool all present as one indistinguishable
      // symptom — three different fixes behind one 503 and a restart loop. The
      // logs are the authenticated side of this pair: the driver's message is
      // safe here and is not safe in the response, which is exactly why the two
      // halves say different things.
      //
      // Deliberately not rate-limited or deduplicated. Probes fire on an
      // interval, so a crash loop repeats this line — that repetition is the
      // signal, not noise.
      this.logger.warn(
        { err: error, timeoutMs: this.timeoutMs },
        'Readiness database probe failed'
      );

      // The reason is deliberately coarse. `/health/ready` is usually reachable
      // to more people than the logs are, and a driver error message can carry
      // the host, the database name and occasionally the user.
      //
      // INVARIANT for every indicator added to `/health/ready`: build your own
      // coarse `reason`; never pass a caught error's message to `down()`. The
      // route is unauthenticated and `@SkipThrottle()`d, and the global filter
      // forwards the terminus payload verbatim, so whatever an indicator puts in
      // `reason` is published to anyone who can reach the probe. Six of
      // terminus's own built-ins do the opposite — `TypeOrmHealthIndicator` and
      // `HttpHealthIndicator` among them pass `err.message` straight through —
      // so adding one to the readiness list without wrapping it would leak the
      // driver or upstream error text this indicator exists to suppress.
      return indicator.down({
        reason:
          error instanceof Error && error.message === DATABASE_HEALTH_TIMEOUT_MESSAGE
            ? DATABASE_HEALTH_TIMEOUT_MESSAGE
            : 'Database is unreachable',
        timeoutMs: this.timeoutMs,
      });
    }
  }

  private async withTimeout(promise: Promise<unknown>): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(DATABASE_HEALTH_TIMEOUT_MESSAGE)), this.timeoutMs);
    });

    try {
      await Promise.race([promise, timeout]);
    } finally {
      // Without this the process keeps an active timer for up to
      // `timeoutMs` after every successful probe.
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}
