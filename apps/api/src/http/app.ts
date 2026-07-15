import express from 'express';
import helmet from 'helmet';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';
import type { Logger } from 'pino';

import type { ApiConfig } from '../bootstrap/config.js';
import { errorHandler, notFoundHandler } from './error-handler.js';
import { healthRouter } from './health.js';
import type { DbPort } from './health.js';
import { createMemoryIdentityRepositories } from '../modules/identity/application/memory-repositories.js';
import { identityRouter } from '../modules/identity/transport/routes.js';
import type { IdentityRepositories } from '../modules/identity/application/ports.js';
import { mediaRouter } from '../modules/media/transport/routes.js';
import { defaultService as defaultMediaService } from '../modules/media/transport/routes.js';
import type { MediaService } from '../modules/media/application/service.js';

export interface AppOptions {
  readonly config: ApiConfig;
  readonly db?: DbPort;
  readonly logger?: Logger;
  readonly identity?: IdentityRepositories;
  readonly media?: MediaService;
}

const requestId: RequestHandler = (request, response, next) => {
  const supplied = request.get('x-request-id');
  const id = supplied && /^[\w:.-]{1,128}$/.test(supplied) ? supplied : randomUUID();
  request.id = id;
  response.setHeader('x-request-id', id);
  next();
};

export function createApp({ config, db, logger = pino({ level: 'silent' }), identity, media }: AppOptions) {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestId);
  app.use(pinoHttp({ logger }));
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  const identityRepositories = identity ?? createMemoryIdentityRepositories();
  app.use('/api/v1', identityRouter(identityRepositories, config));
  app.use('/api/v1', mediaRouter(identityRepositories, config, { service: media ?? defaultMediaService(config) }));
  app.use(healthRouter({ config, db }));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
