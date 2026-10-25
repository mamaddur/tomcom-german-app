import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { API_PREFIX, buildOpenApi, configureApp } from './bootstrap.js';
import { loadEnv } from './config/env.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  if (env.APP_ENV !== 'prod') {
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, buildOpenApi(app));
  }
  await app.listen(env.PORT);
}

void main();
