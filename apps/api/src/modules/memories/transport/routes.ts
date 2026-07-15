import { Router, type Request } from 'express';
import type { IdentityRepositories } from '../../identity/application/ports.js';
import { requireActor, type ActorContext } from '../../identity/transport/routes.js';
import type { MemoryQueryPort } from '../domain/ports.js';

export interface MemoryRouterOptions { readonly query: MemoryQueryPort; }
const context = (request: Request) => (request as Request & { actor?: ActorContext }).actor ?? null;
export function memoriesRouter(options: MemoryRouterOptions, identity: IdentityRepositories): Router {
  const router = Router();
  const actor = requireActor(identity);
  router.get('/me', actor, async (req, res) => { const current = context(req); if (!current) return; const owner = current.userId as never; res.json({ summary: await options.query.summary(owner, current), map: await options.query.map(owner, current) }); });
  router.get('/me/map', actor, async (req, res) => { const current=context(req); if (!current) return; res.json({ items: await options.query.map(current.userId as never, current) }); });
  router.get('/me/timeline', actor, async (req, res) => { const current=context(req); if (!current) return; res.json(await options.query.timeline(current.userId as never, current, typeof req.query.cursor === 'string' ? req.query.cursor : undefined)); });
  router.get('/me/photos', actor, async (req, res) => { const current=context(req); if (!current) return; res.json(await options.query.photos(current.userId as never, current, typeof req.query.cursor === 'string' ? req.query.cursor : undefined)); });
  router.get('/me/visitors', actor, async (req, res) => { const current=context(req); if (!current) return; res.json({ items: await options.query.visitors(current.userId as never, current) }); });
  router.get('/profile/:userId/memories', async (req, res) => { const current=context(req); const owner=String(req.params.userId) as never; res.json({ summary: await options.query.summary(owner, current), map: await options.query.map(owner, current) }); });
  return router;
}
