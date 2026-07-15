import { Router, type Request } from 'express';
import type { IdentityRepositories } from '../../identity/application/ports.js';
import { requireActor, resolveSession, type ActorContext } from '../../identity/index.js';
import type { MemoryQueryPort } from '../domain/ports.js';

export interface MemoryRouterOptions { readonly query: MemoryQueryPort; }
const context = (request: Request) => (request as Request & { actor?: ActorContext }).actor ?? null;
function token(request: Request): string | undefined { const bearer=request.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];const cookie=request.get('cookie')?.split(';').map((part)=>part.trim()).find((part)=>part.startsWith('bliver_session='));return bearer??(cookie?decodeURIComponent(cookie.slice('bliver_session='.length)):undefined); }
async function optionalActor(request: Request, identity: IdentityRepositories): Promise<ActorContext|null> { const raw=token(request);if(!raw)return null;const session=await resolveSession(identity,raw);return session?{userId:session.user.id,sessionId:session.session.id,roles:session.user.roles,transport:request.get('authorization')?'bearer':'cookie',displayName:session.user.displayName}:null; }
export function memoriesRouter(options: MemoryRouterOptions, identity: IdentityRepositories): Router {
  const router = Router();
  const actor = requireActor(identity);
  router.get('/me', actor, async (req, res) => { const current = context(req); if (!current) return; const owner = current.userId as never; res.json({ summary: await options.query.summary(owner, current), map: await options.query.map(owner, current) }); });
  router.get('/me/map', actor, async (req, res) => { const current=context(req); if (!current) return; res.json({ items: await options.query.map(current.userId as never, current) }); });
  router.get('/me/timeline', actor, async (req, res) => { const current=context(req); if (!current) return; res.json(await options.query.timeline(current.userId as never, current, typeof req.query.cursor === 'string' ? req.query.cursor : undefined)); });
  router.get('/me/photos', actor, async (req, res) => { const current=context(req); if (!current) return; res.json(await options.query.photos(current.userId as never, current, typeof req.query.cursor === 'string' ? req.query.cursor : undefined)); });
  router.get('/me/visitors', actor, async (req, res) => { const current=context(req); if (!current) return; res.json({ items: await options.query.visitors(current.userId as never, current) }); });
  router.get('/profile/:userId/memories', async (req, res) => { const current=await optionalActor(req,identity); const owner=String(req.params.userId) as never;if(current&&current.userId!==owner)await options.query.recordVisit(owner,current.userId as never); res.json({ summary: await options.query.summary(owner, current), map: await options.query.map(owner, current) }); });
  router.get('/profile/:userId/memories/timeline', async (req,res)=>{const current=await optionalActor(req,identity);const owner=String(req.params.userId) as never;res.json(await options.query.timeline(owner,current,typeof req.query.cursor==='string'?req.query.cursor:undefined));});
  router.get('/profile/:userId/memories/photos', async (req,res)=>{const current=await optionalActor(req,identity);const owner=String(req.params.userId) as never;res.json(await options.query.photos(owner,current,typeof req.query.cursor==='string'?req.query.cursor:undefined));});
  router.get('/profile/:userId/memories/visitors', async (req,res)=>{const current=await optionalActor(req,identity);const owner=String(req.params.userId) as never;res.json({items:await options.query.visitors(owner,current)});});
  return router;
}
