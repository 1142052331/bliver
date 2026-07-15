import { requestFriendshipInput, socialUserId } from '@bliver/contracts';
import { parseUserId, type UserId } from '@bliver/domain';
import { Router, type Request, type Response } from 'express';

import { requireActor, validMutationCsrf, type ActorContext } from '../../identity/index.js';
import type { IdentityRepositories } from '../../identity/application/ports.js';
import type { FriendshipRecord } from '../application/ports.js';
import { SocialError, type SocialCommandOptions, type SocialService } from '../application/service.js';

type AuthenticatedRequest = Request & { actor: ActorContext };

function problem(response: Response, request: Request, status: number, code: string): void {
  response.status(status).type('application/problem+json').send({ type: 'about:blank', title: status === 401 ? 'Unauthorized' : status === 404 ? 'Not found' : 'Bad request', status, code, requestId: request.id });
}

function actorId(request: Request): UserId {
  return parseUserId((request as AuthenticatedRequest).actor.userId);
}

function mutationAllowed(request: Request, response: Response): boolean {
  if (validMutationCsrf(request, (request as AuthenticatedRequest).actor)) return true;
  problem(response, request, 403, 'CSRF_ORIGIN_INVALID');
  return false;
}

function command(request: Request, fingerprint: object): SocialCommandOptions | undefined {
  const key = request.get('idempotency-key')?.trim();
  if (!key) return undefined;
  if (key.length > 128 || !/^[\w:.-]+$/.test(key)) throw new SocialError('IDEMPOTENCY_CONFLICT');
  return { key, fingerprint: JSON.stringify(fingerprint) };
}

function friendshipDto(record: FriendshipRecord) {
  return { id: record.id, requesterId: record.requesterId, addresseeId: record.addresseeId, status: record.status, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() };
}

function target(record: FriendshipRecord, actor: UserId): UserId {
  return record.requesterId === actor ? record.addresseeId : record.requesterId;
}

function mapError(error: unknown): { readonly status: number; readonly code: string } {
  const code = error instanceof SocialError ? error.code : error instanceof Error && error.message === 'IDEMPOTENCY_CONFLICT' ? 'IDEMPOTENCY_CONFLICT' : 'SOCIAL_UNAVAILABLE';
  if (code === 'RELATIONSHIP_NOT_FOUND' || code === 'FRIENDSHIP_NOT_FOUND') return { status: 404, code: 'RESOURCE_NOT_FOUND' };
  if (code === 'FRIENDSHIP_STATE_CONFLICT' || code === 'SELF_RELATIONSHIP' || code === 'IDEMPOTENCY_CONFLICT') return { status: 409, code };
  return { status: 400, code };
}

export interface SocialRouterOptions {
  readonly service: SocialService;
}

export function socialRouter(options: SocialRouterOptions, identity: IdentityRepositories): Router {
  const router = Router();
  router.use(requireActor(identity));

  router.get('/friendships', async (request, response) => {
    try {
      const current = actorId(request);
      const items = (await options.service.listFriendships(current)).map((record) => ({ friendshipId: record.id, userId: target(record, current), status: 'accepted', updatedAt: record.updatedAt.toISOString() }));
      response.json({ items });
    } catch (error) { const mapped = mapError(error); problem(response, request, mapped.status, mapped.code); }
  });

  router.get('/friendships/requests', async (request, response) => {
    try {
      const current = actorId(request);
      const records = await options.service.listRequests(current);
      const dto = (record: FriendshipRecord) => ({ id: record.id, userId: target(record, current), createdAt: record.createdAt.toISOString() });
      response.json({ incoming: records.filter((record) => record.addresseeId === current).map(dto), outgoing: records.filter((record) => record.requesterId === current).map(dto) });
    } catch (error) { const mapped = mapError(error); problem(response, request, mapped.status, mapped.code); }
  });

  router.post('/friendships', async (request, response) => {
    if (!mutationAllowed(request, response)) return;
    const parsed = requestFriendshipInput.safeParse(request.body);
    if (!parsed.success) { problem(response, request, 400, 'INVALID_REQUEST'); return; }
    try {
      const record = await options.service.requestFriendship(actorId(request), parseUserId(parsed.data.targetUserId), command(request, parsed.data));
      response.status(201).json(friendshipDto(record));
    } catch (error) { const mapped = mapError(error); problem(response, request, mapped.status, mapped.code); }
  });

  router.post('/friendships/:friendshipId/accept', async (request, response) => {
    if (!mutationAllowed(request, response)) return;
    try {
      const id = String(request.params.friendshipId);
      response.json(friendshipDto(await options.service.acceptFriendship(actorId(request), id, command(request, { friendshipId: id }))));
    } catch (error) { const mapped = mapError(error); problem(response, request, mapped.status, mapped.code); }
  });

  router.post('/friendships/:friendshipId/reject', async (request, response) => {
    if (!mutationAllowed(request, response)) return;
    try {
      const id = String(request.params.friendshipId);
      response.json(friendshipDto(await options.service.rejectFriendship(actorId(request), id, command(request, { friendshipId: id }))));
    } catch (error) { const mapped = mapError(error); problem(response, request, mapped.status, mapped.code); }
  });

  router.delete('/friendships/:userId', async (request, response) => {
    if (!mutationAllowed(request, response)) return;
    const parsed = socialUserId.safeParse(request.params.userId);
    if (!parsed.success) { problem(response, request, 400, 'INVALID_REQUEST'); return; }
    try {
      await options.service.removeFriendship(actorId(request), parseUserId(parsed.data), command(request, { userId: parsed.data }));
      response.status(204).end();
    } catch (error) { const mapped = mapError(error); problem(response, request, mapped.status, mapped.code); }
  });

  router.get('/relationships/:userId', async (request, response) => {
    const parsed = socialUserId.safeParse(request.params.userId);
    if (!parsed.success) { problem(response, request, 400, 'INVALID_REQUEST'); return; }
    try {
      const summary = await options.service.getRelationshipSummary(actorId(request), parseUserId(parsed.data));
      if (summary.state === 'blocked') { problem(response, request, 404, 'RESOURCE_NOT_FOUND'); return; }
      response.json(summary);
    } catch (error) { const mapped = mapError(error); problem(response, request, mapped.status, mapped.code); }
  });

  router.get('/blocks', async (request, response) => {
    try {
      const items = (await options.service.listBlocks(actorId(request))).map((record) => ({ userId: record.blockedId, createdAt: record.createdAt.toISOString() }));
      response.json({ items });
    } catch (error) { const mapped = mapError(error); problem(response, request, mapped.status, mapped.code); }
  });

  router.put('/blocks/:userId', async (request, response) => {
    if (!mutationAllowed(request, response)) return;
    const parsed = socialUserId.safeParse(request.params.userId);
    if (!parsed.success) { problem(response, request, 400, 'INVALID_REQUEST'); return; }
    try {
      const record = await options.service.blockUser(actorId(request), parseUserId(parsed.data), command(request, { userId: parsed.data }));
      response.json({ userId: record.blockedId, createdAt: record.createdAt.toISOString() });
    } catch (error) { const mapped = mapError(error); problem(response, request, mapped.status, mapped.code); }
  });

  router.delete('/blocks/:userId', async (request, response) => {
    if (!mutationAllowed(request, response)) return;
    const parsed = socialUserId.safeParse(request.params.userId);
    if (!parsed.success) { problem(response, request, 400, 'INVALID_REQUEST'); return; }
    try {
      await options.service.unblockUser(actorId(request), parseUserId(parsed.data), command(request, { userId: parsed.data }));
      response.status(204).end();
    } catch (error) { const mapped = mapError(error); problem(response, request, mapped.status, mapped.code); }
  });

  return router;
}
