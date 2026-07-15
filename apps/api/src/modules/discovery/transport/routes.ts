import { Router, type Request, type Response } from 'express';
import { activityQuery, mapFootprintQuery } from '@bliver/contracts';
import { resolveSession, type ActorContext } from '../../identity/index.js';
import type { IdentityRepositories } from '../../identity/application/ports.js';
import type { DiscoveryQueryService } from '../application/query.js';
import type { MapFootprintQuery } from '../../footprints/application/map-query.js';

function token(request: Request): string | undefined { const bearer = request.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]; const cookie = request.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith('bliver_session=')); return bearer ?? (cookie ? decodeURIComponent(cookie.slice('bliver_session='.length)) : undefined); }
async function actor(request: Request, identity?: IdentityRepositories): Promise<ActorContext | null> { const value = token(request); if (!value || !identity) return null; const resolved = await resolveSession(identity, value); return resolved ? { userId: resolved.user.id, sessionId: resolved.session.id, roles: resolved.user.roles, transport: request.get('authorization') ? 'bearer' : 'cookie' } : null; }
function problem(response: Response, request: Request, status: number, code: string): void { response.status(status).type('application/problem+json').send({ type: 'about:blank', title: status === 401 ? 'Unauthorized' : 'Bad request', status, code, requestId: request.id }); }

export interface DiscoveryRouterOptions { readonly activity?: DiscoveryQueryService; readonly map?: MapFootprintQuery; readonly regionForActor?: (actor: ActorContext | null) => Promise<{ regionId?: string | null; countryCode?: string | null }>; }

export function discoveryRouter(options: DiscoveryRouterOptions, identity?: IdentityRepositories): Router {
  const router = Router();
  router.get('/activity', async (request, response) => {
    const parsed = activityQuery.safeParse(request.query);
    if (!parsed.success || !options.activity) { problem(response, request, 400, 'INVALID_REQUEST'); return; }
    try { const current = await actor(request, identity); const geo = options.regionForActor ? await options.regionForActor(current) : {}; response.json(await options.activity.execute({ ...parsed.data, actor: current, ...(geo.regionId ? { regionId: geo.regionId } : {}), ...(geo.countryCode ? { countryCode: geo.countryCode } : {}) })); } catch { problem(response, request, 400, 'INVALID_REQUEST'); }
  });
  router.get('/discovery/map', async (request, response) => {
    const parsed = mapFootprintQuery.safeParse(request.query);
    if (!parsed.success || !options.map) { problem(response, request, 400, 'INVALID_REQUEST'); return; }
    try { const current = await actor(request, identity); response.json(await options.map.execute({ actor: current, bounds: parsed.data, limit: parsed.data.limit, ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}), ...(parsed.data.visibility ? { visibility: parsed.data.visibility } : {}) })); } catch { problem(response, request, 400, 'INVALID_REQUEST'); }
  });
  return router;
}
