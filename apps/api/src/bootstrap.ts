import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import helmet from 'helmet';
import { ProblemFilter } from './common/problem.filter.js';
import { createValidationPipe } from './common/validation.js';

export const API_PREFIX = 'v1';

/** Shared by main.ts, tests and the OpenAPI export so all three see the same app. */
export function configureApp(app: INestApplication): void {
  app.use(helmet());
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
