import { Router, type Request, type Response } from 'express';
import { publishFootprintRequest, updateFootprintVisibilityRequest } from '@bliver/contracts';
import { requireActor, resolveSession, type ActorContext } from '../../identity/index.js';
import type { IdentityRepositories } from '../../identity/application/ports.js';
import { createMemoryFootprintRepositories, DeleteFootprint, FootprintConflictError, PublishFootprint, UpdateFootprintVisibility, type FootprintProviderPorts, type FootprintRepositories } from '../application/index.js';
import type { FootprintVisibilityPolicy } from '../domain/visibility-policy.js';
import type { FootprintPolicyInput } from '../domain/visibility-policy.js';

export interface FootprintRouterOptions {
  readonly repositories?: FootprintRepositories;
  readonly providers?: FootprintProviderPorts;
  readonly policy?: FootprintVisibilityPolicy;
}

function problem(response: Response, request: Request, status: number, code: string): void {
  response.status(status).type('application/problem+json').send({ type: 'about:blank', title: status === 401 ? 'Unauthorized' : 'Bad request', status, code, requestId: request.id });
}
function context(request: Request): ActorContext { return (request as Request & { actor: ActorContext }).actor; }
function cookieToken(request: Request): string | undefined { const part = request.get('cookie')?.split(';').map((value) => value.trim()).find((value) => value.startsWith('bliver_session=')); return part ? decodeURIComponent(part.slice('bliver_session='.length)) : undefined; }
async function optionalContext(request: Request, identity: IdentityRepositories): Promise<ActorContext | null> { const bearer = request.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]; const token = bearer ?? cookieToken(request); if (!token) return null; const resolved = await resolveSession(identity, token); return resolved ? { userId: resolved.user.id, sessionId: resolved.session.id, roles: resolved.user.roles, transport: bearer ? 'bearer' : 'cookie' } : null; }
function defaultProviders(): FootprintProviderPorts { return { geocoding: { async resolve() { return { placeId: null, regionId: null }; } }, weather: { async resolve() { return null; } } }; }

export function footprintRouter(identity: IdentityRepositories, options: FootprintRouterOptions = {}): Router {
  const repositories = options.repositories ?? createMemoryFootprintRepositories();
  const providers = options.providers ?? defaultProviders();
  const publish = new PublishFootprint({ repositories, providers });
  const update = new UpdateFootprintVisibility(repositories);
  const remove = new DeleteFootprint(repositories);
  const actor = requireActor(identity);
  const router = Router();
  router.get('/footprints/:footprintId', async (request, response) => {
    const footprintId = String(request.params.footprintId) as never;
    const record = repositories.publicDetails ? await repositories.publicDetails.findById(footprintId) : await repositories.footprints.findById(footprintId).then((item) => item ? { id: item.id, authorId: item.authorId, author: { name: String(item.authorId) }, displayPoint: item.displayPoint, visibility: item.visibility, locationPrecision: item.locationPrecision, publishedAt: item.publishedAt, discoveryExpiresAt: item.discoveryExpiresAt, message: item.message, ...(item.mood ? { mood: item.mood } : {}) } : null);
    if (!record) { problem(response, request, 404, 'FOOTPRINT_NOT_FOUND'); return; }
    try {
      if (options.policy) { const dto = await options.policy.toPublicDto(await optionalContext(request, identity), record as FootprintPolicyInput); response.json({ ...dto, message: record.message }); return; }
      response.json({ id: record.id, author: { id: record.authorId, name: record.author.name }, displayPoint: record.displayPoint, visibility: record.visibility, locationPrecision: record.locationPrecision, message: record.message, ...(record.mood ? { mood: record.mood } : {}), publishedAt: record.publishedAt.toISOString(), ...(record.discoveryExpiresAt ? { discoveryExpiresAt: record.discoveryExpiresAt.toISOString() } : {}) });
    } catch { problem(response, request, 404, 'FOOTPRINT_NOT_FOUND'); }
  });
  router.post('/footprints', actor, async (request, response) => {
    const parsed = publishFootprintRequest.safeParse(request.body);
    const key = request.get('idempotency-key')?.trim();
    if (!key || !parsed.success) { problem(response, request, 400, !key ? 'IDEMPOTENCY_KEY_REQUIRED' : 'INVALID_REQUEST'); return; }
    try {
      const result = await publish.execute({ actorId: context(request).userId as never, idempotencyKey: key, message: parsed.data.message, privatePoint: parsed.data.privatePoint, visibility: parsed.data.visibility, locationPrecision: parsed.data.locationPrecision, mediaAssetIds: parsed.data.mediaAssetIds, ...(parsed.data.mood ? { mood: parsed.data.mood } : {}), ...(parsed.data.discoveryExpiresAt !== undefined ? { discoveryExpiresAt: parsed.data.discoveryExpiresAt ? new Date(parsed.data.discoveryExpiresAt) : null } : {}) });
      response.status(201).json({ footprint: result.footprint, event: result.outbox });
    } catch (error) { problem(response, request, error instanceof FootprintConflictError ? 409 : 500, error instanceof FootprintConflictError ? error.code : 'FOOTPRINT_UNAVAILABLE'); }
  });
  router.patch('/footprints/:footprintId/visibility', actor, async (request, response) => {
    const parsed = updateFootprintVisibilityRequest.safeParse(request.body);
    if (!parsed.success) { problem(response, request, 400, 'INVALID_REQUEST'); return; }
    try { const result = await update.execute({ actorId: context(request).userId as never, footprintId: String(request.params.footprintId) as never, visibility: parsed.data.visibility }); response.json(result); } catch (error) { problem(response, request, error instanceof FootprintConflictError ? 409 : 500, error instanceof FootprintConflictError ? error.code : 'FOOTPRINT_UNAVAILABLE'); }
  });
  router.delete('/footprints/:footprintId', actor, async (request, response) => {
    try { await remove.execute({ actorId: context(request).userId as never, footprintId: String(request.params.footprintId) as never }); response.status(204).end(); } catch (error) { problem(response, request, error instanceof FootprintConflictError ? 409 : 500, error instanceof FootprintConflictError ? error.code : 'FOOTPRINT_UNAVAILABLE'); }
  });
  return router;
}
