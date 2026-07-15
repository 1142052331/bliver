import { Router, type Request, type Response } from 'express';
import { locationResolveRequest, mapFootprintQuery, placeSearchRequest } from '@bliver/contracts';
import { MapFootprintQuery, createMemoryMapFootprintRepository } from '../application/index.js';
import { FootprintVisibilityPolicy } from '../domain/visibility-policy.js';
import type { FootprintPolicyInput } from '../domain/visibility-policy.js';
import type { ActorContext } from '../../identity/index.js';

export interface MapRouterOptions { readonly query?: MapFootprintQuery; readonly records?: readonly FootprintPolicyInput[]; }
function problem(response: Response, request: Request, status: number, code: string): void { response.status(status).type('application/problem+json').send({ type: 'about:blank', title: 'Bad request', status, code, requestId: request.id }); }
function actor(request: Request): ActorContext | null { return (request as Request & { actor?: ActorContext }).actor ?? null; }
function defaultQuery(records: readonly FootprintPolicyInput[] = []): MapFootprintQuery {
  const policy = new FootprintVisibilityPolicy({ records: { async findById(id) { return records.find((record) => record.id === id) ?? null; } }, friendships: { async areAcceptedFriends() { return false; } }, blocks: { async isEitherBlocked() { return false; } }, moderation: { async hasCaseAccess() { return false; } }, now: () => new Date() });
  return new MapFootprintQuery({ repository: createMemoryMapFootprintRepository(records), policy });
}

export function mapRouter(options: MapRouterOptions = {}): Router {
  const query = options.query ?? defaultQuery(options.records);
  const router = Router();
  router.get('/map/footprints', async (request, response) => {
    const parsed = mapFootprintQuery.safeParse(request.query);
    if (!parsed.success) { problem(response, request, 400, 'INVALID_REQUEST'); return; }
    try { const result = await query.execute({ actor: actor(request), bounds: parsed.data, ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}), ...(parsed.data.visibility ? { visibility: parsed.data.visibility } : {}) }); response.json(result); } catch { problem(response, request, 400, 'INVALID_REQUEST'); }
  });
  router.get('/places/search', (request, response) => { const parsed = placeSearchRequest.safeParse({ query: request.query.q }); if (!parsed.success) { problem(response, request, 400, 'INVALID_REQUEST'); return; } response.json({ items: [], query: parsed.data.query }); });
  router.post('/location/resolve', (request, response) => { const parsed = locationResolveRequest.safeParse(request.body); if (!parsed.success) { problem(response, request, 400, 'INVALID_REQUEST'); return; } response.json({ latitude: parsed.data.latitude, longitude: parsed.data.longitude, place: null, region: null }); });
  return router;
}
