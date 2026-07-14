import { Router } from 'express';

import { healthResponse } from '@bliver/contracts';

import type { ApiConfig } from '../bootstrap/config.js';

export interface DbPort {
  query(statement: string): Promise<{ rows: readonly unknown[] }>;
}

interface HealthDependencies {
  readonly config: ApiConfig;
  readonly db: DbPort | undefined;
}

function payload(config: ApiConfig) {
  return healthResponse.parse({
    status: 'ok',
    version: config.releaseSha,
    environment: config.deployEnv,
  });
}

export function healthRouter({ config, db }: HealthDependencies): Router {
  const router = Router();

  router.get('/healthz', (_request, response) => {
    response.json(payload(config));
  });

  router.get('/readyz', async (request, response) => {
    try {
      if (!db) {
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
      response.json(payload(config));
    } catch (error: unknown) {
      void error;
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
