import { Router, type NextFunction, type Request, type Response } from 'express';
import { mediaCompleteRequest, mediaSignatureRequest } from '@bliver/contracts';

import type { ApiConfig } from '../../../bootstrap/config.js';
import { requireActor, validMutationCsrf, type ActorContext } from '../../identity/index.js';
import type { IdentityRepositories } from '../../identity/application/ports.js';
import {
  createMemoryMediaRepositories,
  MediaError,
  MediaService,
  type MediaAdapter,
  type MediaRepositories,
} from '../application/index.js';
import { CloudinaryAdapter } from '../platform/cloudinary/index.js';

interface RateLimitEntry {
  readonly count: number;
  readonly startedAt: number;
}

export interface MediaRouterOptions {
  readonly service?: MediaService;
  readonly adapter?: MediaAdapter;
  readonly repositories?: MediaRepositories;
  readonly now?: () => number;
  readonly windowMs?: number;
  readonly maxRequests?: number;
}

function problem(response: Response, request: Request, status: number, code: string): void {
  response.status(status).type('application/problem+json').send({
    type: 'about:blank',
    title: status === 401 ? 'Unauthorized' : status === 429 ? 'Too Many Requests' : 'Bad request',
    status,
    code,
    requestId: request.id,
  });
}

function actorFrom(request: Request): ActorContext {
  return (request as Request & { actor: ActorContext }).actor;
}

function statusFor(error: MediaError): number {
  switch (error.code) {
    case 'MEDIA_CONFIGURATION_MISSING':
      return 503;
    case 'MEDIA_NOT_FOUND':
      return 404;
    case 'MEDIA_DELETE_FAILED':
      return 502;
    case 'MEDIA_COMPLETION_FAILED':
      return 502;
    case 'IDEMPOTENCY_CONFLICT':
      return 409;
    case 'MEDIA_MIME_UNSUPPORTED':
    case 'MEDIA_SIZE_INVALID':
      return 400;
  }
}

function createRateLimit(options: Pick<MediaRouterOptions, 'now' | 'windowMs' | 'maxRequests'>) {
  const attempts = new Map<string, RateLimitEntry>();
  const now = options.now ?? (() => Date.now());
  const windowMs = options.windowMs ?? 60_000;
  const maxRequests = options.maxRequests ?? 10;
  return (request: Request, response: Response, next: NextFunction): void => {
    const actor = actorFrom(request);
    const currentTime = now();
    const entry = attempts.get(actor.userId);
    if (entry && currentTime - entry.startedAt < windowMs && entry.count >= maxRequests) {
      problem(response, request, 429, 'RATE_LIMITED');
      return;
    }
    attempts.set(actor.userId, entry && currentTime - entry.startedAt < windowMs
      ? { count: entry.count + 1, startedAt: entry.startedAt }
      : { count: 1, startedAt: currentTime });
    next();
  };
}

function defaultService(config: ApiConfig): MediaService {
  return new MediaService({
    adapter: config.cloudinary ? new CloudinaryAdapter(config.cloudinary) : undefined,
    repositories: createMemoryMediaRepositories(),
  });
}

export function mediaRouter(
  identity: IdentityRepositories,
  config: ApiConfig,
  options: MediaRouterOptions = {},
): Router {
  const service = options.service ?? new MediaService({
    adapter: options.adapter ?? (config.cloudinary ? new CloudinaryAdapter(config.cloudinary) : undefined),
    repositories: options.repositories ?? createMemoryMediaRepositories(),
  });
  const router = Router();
  const actor = requireActor(identity);
  const rateLimit = createRateLimit(options);
  const csrf = (request: Request, response: Response, next: NextFunction): void => {
    if (validMutationCsrf(request, actorFrom(request))) { next(); return; }
    problem(response, request, 403, 'CSRF_ORIGIN_INVALID');
  };

  router.post('/media/signature', actor, csrf, rateLimit, async (request, response) => {
    const idempotencyKey = request.get('idempotency-key')?.trim();
    if (!idempotencyKey || idempotencyKey.length > 128) {
      problem(response, request, 400, 'IDEMPOTENCY_KEY_REQUIRED');
      return;
    }
    const parsed = mediaSignatureRequest.safeParse(request.body);
    if (!parsed.success) {
      problem(response, request, 400, 'INVALID_REQUEST');
      return;
    }
    const context = actorFrom(request);
    try {
      const result = await service.requestSignature({ actorId: context.userId, idempotencyKey, ...parsed.data });
      response.status(200).json(result);
    } catch (error) {
      if (error instanceof MediaError) {
        problem(response, request, statusFor(error), error.code);
        return;
      }
      problem(response, request, 500, 'MEDIA_UNAVAILABLE');
    }
  });

  router.delete('/media/:assetId', actor, csrf, async (request, response) => {
    const context = actorFrom(request);
    try {
      await service.deleteAsset({ actorId: context.userId, assetId: String(request.params.assetId) });
      response.status(204).end();
    } catch (error) {
      if (error instanceof MediaError) {
        problem(response, request, statusFor(error), error.code);
        return;
      }
      problem(response, request, 500, 'MEDIA_UNAVAILABLE');
    }
  });
  router.post('/media/:assetId/complete', actor, csrf, async (request, response) => {
    const parsed = mediaCompleteRequest.safeParse(request.body);
    if (!parsed.success) {
      problem(response, request, 400, 'INVALID_REQUEST');
      return;
    }
    const context = actorFrom(request);
    try {
      await service.completeAsset({ actorId: context.userId, assetId: String(request.params.assetId), ...parsed.data });
      response.status(204).end();
    } catch (error) {
      if (error instanceof MediaError) {
        problem(response, request, statusFor(error), error.code);
        return;
      }
      problem(response, request, 500, 'MEDIA_UNAVAILABLE');
    }
  });
  return router;
}

export { defaultService };
