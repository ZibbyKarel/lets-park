/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app/app.module';
import type { ApiEnv } from './env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  // `ConfigService` returns the value validated by `validateApiEnv` in
  // `AppModule` — if PORT were missing or invalid, the process would already
  // have crashed during `NestFactory.create` above, before reaching here.
  const configService = app.get(ConfigService<ApiEnv, true>);
  const port = configService.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`🚀 Application is running on: http://localhost:${port}/${globalPrefix}`);
}

bootstrap();
