import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import helmet from 'helmet';
import { ProblemFilter } from './common/problem.filter.js';
import { createValidationPipe } from './common/validation.js';

export const API_PREFIX = 'v1';

/** Shared by main.ts, tests and the OpenAPI export so all three see the same app. */
export function configureApp(app: INestApplication): void {
  app.use(helmet());
  // Whole-lesson saves from the studio (te + en text, 20+ questions) exceed the 100 kB default.
  (app as NestExpressApplication).useBodyParser('json', { limit: '1mb' });
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ProblemFilter());
  app.enableShutdownHooks();
}

export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('TOMCOM German Learning API')
    .setDescription('One API for the learner app, admin portal, content studio and verify page.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}
