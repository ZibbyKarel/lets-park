import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ContractExceptionFilter } from '../common/filters/contract-exception.filter';
import { globalThrottlerOptions } from '../common/throttling/throttle-tiers';
import { DatabaseModule } from '../database/database.module';
import type { ApiEnv } from '../env';
import { validateApiEnv } from '../env';
import { HealthModule } from '../health/health.module';
import { buildLoggerOptions } from '../logging/logger.options';
import { ShutdownModule } from '../shutdown/shutdown.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

/**
 * The operational baseline is assembled here rather than in `main.ts` wherever
 * it can be, so that a test spinning up `AppModule` gets the same filter,
 * guard and logger the running server does. Only what genuinely needs the
 * `INestApplication` — helmet, CORS, body limits, shutdown hooks — lives in
 * `main.ts`.
 *
 * `ConfigModule` is first on purpose: `validateApiEnv` runs during its
 * initialization, so a missing variable aborts the boot before any other module
 * has done anything.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateApiEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<ApiEnv, true>) =>
        buildLoggerOptions({
          LOG_LEVEL: configService.get('LOG_LEVEL', { infer: true }),
          NODE_ENV: configService.get('NODE_ENV', { infer: true }),
        }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<ApiEnv, true>) =>
        globalThrottlerOptions({
          THROTTLE_TTL_MS: configService.get('THROTTLE_TTL_MS', { infer: true }),
          THROTTLE_LIMIT: configService.get('THROTTLE_LIMIT', { infer: true }),
        }),
    }),
    ShutdownModule,
    DatabaseModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Registered as a provider rather than via `app.useGlobalFilters(...)` so
    // that Nest can inject the pino logger into it.
    { provide: APP_FILTER, useClass: ContractExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
