import { Router, type Request, type Response } from 'express';
import { locationResolveRequest, mapFootprintQuery, placeSearchRequest } from '@bliver/contracts';
import { MapFootprintQuery, createMemoryMapFootprintRepository } from '../application/index.js';
import { FootprintVisibilityPolicy } from '../domain/visibility-policy.js';
import type { FootprintPolicyInput } from '../domain/visibility-policy.js';
import type { ActorContext } from '../../identity/index.js';
import { resolveSession } from '../../identity/application/commands.js';
import type { IdentityRepositories } from '../../identity/application/ports.js';
import type { GeographyPorts } from '../../../platform/geography/providers.js';

export interface MapRouterOptions { readonly query?: MapFootprintQuery; readonly records?: readonly FootprintPolicyInput[]; readonly geography?: GeographyPorts; }
function problem(response: Response, request: Request, status: number, code: string): void { response.status(status).type('application/problem+json').send({ type: 'about:blank', title: 'Bad request', status, code, requestId: request.id }); }
function cookieToken(request: Request): string | undefined { const value = request.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith('bliver_session=')); return value ? decodeURIComponent(value.slice('bliver_session='.length)) : undefined; }
async function actor(request: Request, identity?: IdentityRepositories): Promise<ActorContext | null> {
  const existing = (request as Request & { actor?: ActorContext }).actor;
  if (existing) return existing;
  const bearer = request.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = bearer ?? cookieToken(request);
  if (!identity || !token) return null;
  const resolved = await resolveSession(identity, token);
  return resolved ? { userId: resolved.user.id, sessionId: resolved.session.id, roles: resolved.user.roles, transport: bearer ? 'bearer' : 'cookie' } : null;
}
function defaultQuery(records: readonly FootprintPolicyInput[] = []): MapFootprintQuery {
  const policy = new FootprintVisibilityPolicy({ records: { async findById(id) { return records.find((record) => record.id === id) ?? null; } }, friendships: { async areAcceptedFriends() { return false; } }, blocks: { async isEitherBlocked() { return false; } }, moderation: { async hasCaseAccess() { return false; } }, now: () => new Date() });
  return new MapFootprintQuery({ repository: createMemoryMapFootprintRepository(records), policy });
}

export function mapRouter(options: MapRouterOptions = {}, identity?: IdentityRepositories): Router {
  const query = options.query ?? defaultQuery(options.records);
  const router = Router();
  router.get('/map/footprints', async (request, response) => {
    const parsed = mapFootprintQuery.safeParse(request.query);
    if (!parsed.success) { problem(response, request, 400, 'INVALID_REQUEST'); return; }
    try { const result = await query.execute({ actor: await actor(request, identity), bounds: parsed.data, limit: parsed.data.limit, ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}), ...(parsed.data.visibility ? { visibility: parsed.data.visibility } : {}) }); response.json(result); } catch { problem(response, request, 400, 'INVALID_REQUEST'); }
  });
  router.get('/places/search', async (request, response) => { const parsed = placeSearchRequest.safeParse({ query: request.query.q }); if (!parsed.success) { problem(response, request, 400, 'INVALID_REQUEST'); return; } const items = options.geography ? await options.geography.searchPlaces(parsed.data.query) : []; response.json({ items, query: parsed.data.query }); });
  router.post('/location/resolve', async (request, response) => { const parsed = locationResolveRequest.safeParse(request.body); if (!parsed.success) { problem(response, request, 400, 'INVALID_REQUEST'); return; } const resolved = options.geography ? await options.geography.geocode(parsed.data) : { place: null, region: null }; const weather = options.geography ? await options.geography.weather(parsed.data) : null; response.json({ latitude: parsed.data.latitude, longitude: parsed.data.longitude, ...resolved, weather }); });
  return router;
}
