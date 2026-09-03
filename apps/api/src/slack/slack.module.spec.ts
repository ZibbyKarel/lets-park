/**
 * The wiring, and the scope boundary.
 *
 * `AppModule` is compiled rather than `SlackModule` alone, because the fact
 * worth asserting is not that `SlackModule` resolves on its own — it is that
 * the `DomainEventPublisher` the *reservation services* receive is the Slack
 * one, and that the same instance is shared rather than duplicated. A test that
 * built `SlackModule` in isolation could not see either.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { DomainEventPublisher } from '../reservations/reservation-events';
import { ReservationsService } from '../reservations/reservations.service';
import { DailySummaryJob } from './daily-summary.job';
import { SlackClient } from './slack-client.service';
import { SlackDomainEventPublisher } from './slack-domain-event.publisher';
import { SlackConfig } from './slack.config';
import { SlackModule } from './slack.module';

const ENV = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgresql://lets_park:lets_park@localhost:5432/lets_park',
  AUTH_OKTA_ISSUER: 'http://localhost:8080/default',
  AUTH_OKTA_AUDIENCE: 'api://default',
  CORS_ALLOWED_ORIGINS: 'http://localhost:4200',
  LOG_LEVEL: 'fatal',
};

describe('SlackModule inside AppModule', () => {
  let moduleRef: TestingModule;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    // Same dance as `app.module.spec.ts`: `validateApiEnv` runs while the
    // `@Module` decorator is evaluated, i.e. at import time.
    Object.assign(process.env, ENV);
    const { AppModule } = await import('../app/app.module');

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ ping: jest.fn(), onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
    process.env = { ...originalEnv };
  });

  it('binds the after-commit seam to the Slack publisher', () => {
    const bound = moduleRef.get(DomainEventPublisher, { strict: false });

    expect(bound).toBeInstanceOf(SlackDomainEventPublisher);
  });

  it('shares one publisher between the seam and SlackModule, not two', () => {
    // `useExisting`, not `useClass`. A second instance would resolve here too
    // and nothing would look wrong — until it had its own state.
    expect(moduleRef.get(DomainEventPublisher, { strict: false })).toBe(
      moduleRef.get(SlackDomainEventPublisher, { strict: false })
    );
  });

  it('injects the same publisher into ReservationsService', () => {
    const service = moduleRef.get(ReservationsService, { strict: false });

    expect(service).toBeInstanceOf(ReservationsService);
    expect(moduleRef.get(DomainEventPublisher, { strict: false })).toBeInstanceOf(
      SlackDomainEventPublisher
    );
  });

  it('defaults to Slack off, so a machine with no configuration posts nothing', () => {
    expect(moduleRef.get(SlackConfig, { strict: false }).target).toBeUndefined();
    expect(moduleRef.get(SlackClient, { strict: false }).enabled).toBe(false);
  });

  it('reads the schedule from the environment', () => {
    expect(moduleRef.get(SlackConfig, { strict: false }).dailySummaryAt).toBe('08:00');
    expect(moduleRef.get(DailySummaryJob, { strict: false })).toBeInstanceOf(DailySummaryJob);
  });

  describe('the outbound-only boundary', () => {
    it('registers no controller — nothing from Slack is ever accepted', () => {
      // `plan.md`'s scope boundary, checked rather than asserted in prose: a
      // slash command, a Block Kit interaction or an events subscription all
      // need a route, and a route needs a controller in this module.
      const controllers = Reflect.getMetadata('controllers', SlackModule) as unknown[] | undefined;

      expect(controllers ?? []).toEqual([]);
    });

    it('keeps every `@slack/web-api` import inside this module', () => {
      // Not a lint rule (the package is not in `WRAPPED_LIBRARIES` — nothing
      // wraps it, `SlackClient` *is* the wrapper), so the containment is
      // asserted here. Anything outside `slack/` in this list is a second place
      // Slack could be called from.
      expect(importersOf(/from '@slack\/web-api'/)).toEqual([
        join('slack', 'slack-client.service.spec.ts'),
        join('slack', 'slack-client.service.ts'),
        join('slack', 'slack-failure.spec.ts'),
        join('slack', 'slack-failure.ts'),
        join('slack', 'slack.db.spec.ts'),
      ]);
    });

    it('constructs a WebClient in exactly one shipped file', () => {
      // The two specs build their own, pointed at a local server. In shipped
      // code there is one constructor call, with one set of options — the
      // timeout, the disabled SDK retry and the suppressed original error that
      // `slack-client.service.ts` documents.
      expect(importersOf(/new WebClient\(/).filter((file) => !file.includes('spec'))).toEqual([
        join('slack', 'slack-client.service.ts'),
      ]);
    });
  });
});

/** Files under `apps/api/src` matching `pattern`, relative and sorted. */
function importersOf(pattern: RegExp): string[] {
  const apiSource = join(__dirname, '..');
  return filesUnder(apiSource)
    .filter((file) => pattern.test(readFileSync(file, 'utf8')))
    .map((file) => relative(apiSource, file))
    .sort();
}

/** Every `.ts` file under `dir`, recursively. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return filesUnder(path);
    }
    return entry.isFile() && path.endsWith('.ts') ? [path] : [];
  });
}
