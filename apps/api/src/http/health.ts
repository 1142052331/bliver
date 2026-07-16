import { Router } from 'express';

import { healthResponse } from '@bliver/contracts';

import type { ApiConfig } from '../bootstrap/config.js';
import type { ObservabilityRegistry } from '../platform/observability/index.js';

export interface DbPort {
  query(statement: string): Promise<{ rows: readonly unknown[] }>;
}

interface HealthDependencies {
  readonly config: ApiConfig;
  readonly db: DbPort | undefined;
  readonly observability?: ObservabilityRegistry;
}

function payload(config: ApiConfig) {
  return healthResponse.parse({
    status: 'ok',
    version: config.releaseSha,
    environment: config.deployEnv,
  });
}

export function healthRouter({ config, db, observability }: HealthDependencies): Router {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('cache-control', 'no-store');
    next();
  });

  router.get('/healthz', (_request, response) => {
    response.json(payload(config));
  });

  router.get('/readyz', async (request, response) => {
    try {
      if (!db) {
        observability?.dependency('dbPool', false);
        response
          .status(503)
          .type('application/problem+json')
          .json({
            type: 'about:blank',
            title: 'Service unavailable',
            status: 503,
            code: 'DB_UNAVAILABLE',
            requestId: request.id,
          });
        return;
      }

      await db.query('select 1');
      observability?.dependency('dbPool', true);
      response.json(payload(config));
    } catch (error: unknown) {
      void error;
      observability?.dependency('dbPool', false);
      response
        .status(503)
        .type('application/problem+json')
        .json({
          type: 'about:blank',
          title: 'Service unavailable',
          status: 503,
          code: 'DB_UNAVAILABLE',
          requestId: request.id,
        });
    }
  });

  router.get('/versionz', (_request, response) => {
    response.json(payload(config));
  });

  return router;
}
