import createClient, { type ClientOptions } from 'openapi-fetch';
import type { paths } from './schema';

export type { paths, components } from './schema';

/** Typed client for the TOMCOM API. Types are generated from apps/api/openapi.json. */
export function createApiClient(options: ClientOptions & { baseUrl: string }) {
  return createClient<paths>(options);
}
