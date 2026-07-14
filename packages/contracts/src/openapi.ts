import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';

import { problemDetails } from './errors.js';
import { healthResponse } from './health.js';

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  const healthSchema = registry.register('HealthResponse', healthResponse);
  const problemSchema = registry.register('ProblemDetails', problemDetails);

  for (const path of ['/healthz', '/readyz', '/versionz'] as const) {
    registry.registerPath({
      method: 'get',
      path,
      responses: {
        200: {
          description: 'The service is healthy',
          content: {
            'application/json': { schema: healthSchema },
          },
        },
        500: {
          description: 'The service is unavailable',
          content: {
            'application/problem+json': { schema: problemSchema },
          },
        },
      },
    });
  }

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Bliver V2 API',
      version: '0.1.0',
    },
  });
}
