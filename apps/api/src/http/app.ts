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
import { footprintRouter } from '../modules/footprints/transport/routes.js';
import type { FootprintRouterOptions } from '../modules/footprints/transport/routes.js';
import { mapRouter } from '../modules/footprints/transport/map-routes.js';
import type { MapRouterOptions } from '../modules/footprints/transport/map-routes.js';
import { discoveryRouter } from '../modules/discovery/transport/routes.js';
import type { DiscoveryRouterOptions } from '../modules/discovery/transport/routes.js';
import { interactionRouter } from '../modules/interactions/transport/routes.js';
import { createMemoryInteractionRepository, InteractionService } from '../modules/interactions/application/service.js';
import { reportRouter } from '../modules/moderation/transport/routes.js';
import { CreateReport, createMemoryReportRepository } from '../modules/moderation/domain/reports.js';
import { SocialService, createMemorySocialRepository, socialRouter } from '../modules/social/index.js';

export interface AppOptions {
  readonly config: ApiConfig;
  readonly db?: DbPort;
  readonly logger?: Logger;
  readonly identity?: IdentityRepositories;
  readonly media?: MediaService;
  readonly footprints?: FootprintRouterOptions;
  readonly map?: MapRouterOptions;
  readonly discovery?: DiscoveryRouterOptions;
  readonly interactions?: { readonly service?: InteractionService };
  readonly reports?: { readonly create?: CreateReport };
  readonly social?: { readonly service?: SocialService };
}

const requestId: RequestHandler = (request, response, next) => {
  const supplied = request.get('x-request-id');
  const id = supplied && /^[\w:.-]{1,128}$/.test(supplied) ? supplied : randomUUID();
  request.id = id;
  response.setHeader('x-request-id', id);
  next();
};

export function createApp({ config, db, logger = pino({ level: 'silent' }), identity, media, footprints, map, discovery, interactions, reports, social }: AppOptions) {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestId);
  app.use(pinoHttp({ logger }));
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  const identityRepositories = identity ?? createMemoryIdentityRepositories();
  app.use('/api/v1', identityRouter(identityRepositories, config));
  app.use('/api/v1', mediaRouter(identityRepositories, config, { service: media ?? defaultMediaService(config) }));
  app.use('/api/v1', footprintRouter(identityRepositories, footprints));
  app.use('/api/v1', mapRouter(map, identityRepositories));
  app.use('/api/v1', discoveryRouter({ ...(discovery ?? {}), ...(map?.query ? { map: map.query } : {}) }, identityRepositories));
  const interactionService = interactions?.service ?? new InteractionService(createMemoryInteractionRepository(), { async canInteract() { return true; }, async isBlocked() { return false; }, async footprintOwner() { return null; } });
  app.use('/api/v1', interactionRouter({ service: interactionService }, identityRepositories));
  const reportCreate = reports?.create ?? new CreateReport(createMemoryReportRepository(), { async canReport() { return true; } });
  app.use('/api/v1', reportRouter({ create: reportCreate }, identityRepositories));
  const socialService = social?.service ?? new SocialService(createMemorySocialRepository());
  app.use('/api/v1', socialRouter({ service: socialService }, identityRepositories));
  app.use(healthRouter({ config, db }));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
