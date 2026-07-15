import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireActor, type ActorContext } from '../../identity/index.js';
import type { IdentityRepositories } from '../../identity/application/ports.js';
import { createMemoryFootprintRepositories, DeleteFootprint, FootprintConflictError, PublishFootprint, UpdateFootprintVisibility, type FootprintProviderPorts, type FootprintRepositories } from '../application/index.js';

const publishRequest = z.object({ message: z.string().min(1).max(2_000), mood: z.string().max(64).optional(), privatePoint: z.object({ lat: z.number(), lng: z.number() }), visibility: z.enum(['public', 'friends', 'private']), locationPrecision: z.enum(['precise', 'approximate']), mediaAssetIds: z.array(z.string().min(1)).max(12).default([]), discoveryExpiresAt: z.string().datetime().nullable().optional() }).strict();
const visibilityRequest = z.object({ visibility: z.enum(['public', 'friends', 'private']) }).strict();

export interface FootprintRouterOptions {
  readonly repositories?: FootprintRepositories;
  readonly providers?: FootprintProviderPorts;
}

function problem(response: Response, request: Request, status: number, code: string): void {
  response.status(status).type('application/problem+json').send({ type: 'about:blank', title: status === 401 ? 'Unauthorized' : 'Bad request', status, code, requestId: request.id });
}
function context(request: Request): ActorContext { return (request as Request & { actor: ActorContext }).actor; }
function defaultProviders(): FootprintProviderPorts { return { geocoding: { async resolve() { return { placeId: null, regionId: null }; } }, weather: { async resolve() { return null; } } }; }

export function footprintRouter(identity: IdentityRepositories, options: FootprintRouterOptions = {}): Router {
  const repositories = options.repositories ?? createMemoryFootprintRepositories();
  const providers = options.providers ?? defaultProviders();
  const publish = new PublishFootprint({ repositories, providers });
  const update = new UpdateFootprintVisibility(repositories);
  const remove = new DeleteFootprint(repositories);
  const actor = requireActor(identity);
  const router = Router();
  router.post('/footprints', actor, async (request, response) => {
    const parsed = publishRequest.safeParse(request.body);
    const key = request.get('idempotency-key')?.trim();
    if (!key || !parsed.success) { problem(response, request, 400, !key ? 'IDEMPOTENCY_KEY_REQUIRED' : 'INVALID_REQUEST'); return; }
    try {
      const result = await publish.execute({ actorId: context(request).userId as never, idempotencyKey: key, message: parsed.data.message, privatePoint: parsed.data.privatePoint, visibility: parsed.data.visibility, locationPrecision: parsed.data.locationPrecision, mediaAssetIds: parsed.data.mediaAssetIds, ...(parsed.data.mood ? { mood: parsed.data.mood } : {}), ...(parsed.data.discoveryExpiresAt ? { discoveryExpiresAt: new Date(parsed.data.discoveryExpiresAt) } : {}) });
      response.status(201).json({ footprint: result.footprint, event: result.outbox });
    } catch (error) { problem(response, request, error instanceof FootprintConflictError ? 409 : 500, error instanceof FootprintConflictError ? error.code : 'FOOTPRINT_UNAVAILABLE'); }
  });
  router.patch('/footprints/:footprintId/visibility', actor, async (request, response) => {
    const parsed = visibilityRequest.safeParse(request.body);
    if (!parsed.success) { problem(response, request, 400, 'INVALID_REQUEST'); return; }
    try { const result = await update.execute({ actorId: context(request).userId as never, footprintId: String(request.params.footprintId) as never, visibility: parsed.data.visibility }); response.json(result); } catch (error) { problem(response, request, error instanceof FootprintConflictError ? 409 : 500, error instanceof FootprintConflictError ? error.code : 'FOOTPRINT_UNAVAILABLE'); }
  });
  router.delete('/footprints/:footprintId', actor, async (request, response) => {
    try { await remove.execute({ actorId: context(request).userId as never, footprintId: String(request.params.footprintId) as never }); response.status(204).end(); } catch (error) { problem(response, request, error instanceof FootprintConflictError ? 409 : 500, error instanceof FootprintConflictError ? error.code : 'FOOTPRINT_UNAVAILABLE'); }
  });
  return router;
}
