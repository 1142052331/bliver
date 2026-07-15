import { conversationId, conversationUserId, greetingInput, messageHistoryQuery, messageInput, readMessageInput, replyInput, typingInput } from '@bliver/contracts';
import { parseUserId } from '@bliver/domain';
import { Router, type Request, type Response } from 'express';

import { requireActor, validMutationCsrf, type ActorContext } from '../../identity/index.js';
import type { IdentityRepositories } from '../../identity/application/ports.js';
import type { ConversationRecord, MessageRecord } from '../application/ports.js';
import { ConversationError, type ConversationCommandOptions, type ConversationService } from '../application/service.js';

type AuthenticatedRequest = Request & { actor: ActorContext };
function problem(response: Response, request: Request, status: number, code: string): void { response.status(status).type('application/problem+json').send({ type: 'about:blank', title: status === 401 ? 'Unauthorized' : status === 404 ? 'Not found' : 'Bad request', status, code, requestId: request.id }); }
function actorId(request: Request) { return parseUserId((request as AuthenticatedRequest).actor.userId); }
function mutationAllowed(request: Request, response: Response): boolean { if (validMutationCsrf(request, (request as AuthenticatedRequest).actor)) return true; problem(response, request, 403, 'CSRF_ORIGIN_INVALID'); return false; }
function command(request: Request, fingerprint: object): ConversationCommandOptions | undefined { const key = request.get('idempotency-key')?.trim(); return key ? { key, fingerprint: JSON.stringify(fingerprint) } : undefined; }
function conversationDto(item: ConversationRecord) { return { id: item.id, participantLowId: item.participantLowId, participantHighId: item.participantHighId, initiatorId: item.initiatorId, state: item.state, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() }; }
function messageDto(item: MessageRecord) { return { id: item.id, conversationId: item.conversationId, senderId: item.senderId, content: item.content, kind: item.kind, sentAt: item.sentAt.toISOString(), eventId: item.eventId, moderation: item.moderation }; }
function cursorEncode(item: MessageRecord): string { return Buffer.from(JSON.stringify({ sentAt: item.sentAt.toISOString(), id: item.id }), 'utf8').toString('base64url'); }
function cursorDecode(value: string | undefined): { sentAt: Date; id: string } | undefined { if (!value) return undefined; try { const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { sentAt?: string; id?: string }; if (!parsed.sentAt || !parsed.id) return undefined; const sentAt = new Date(parsed.sentAt); return Number.isNaN(sentAt.getTime()) ? undefined : { sentAt, id: parsed.id }; } catch { return undefined; } }
function mapError(error: unknown): { status: number; code: string } { const code = error instanceof ConversationError ? error.code : error instanceof Error && error.message === 'IDEMPOTENCY_CONFLICT' ? 'IDEMPOTENCY_CONFLICT' : 'CONVERSATION_UNAVAILABLE'; if (code === 'CONVERSATION_NOT_FOUND') return { status: 404, code: 'RESOURCE_NOT_FOUND' }; if (code === 'GREETING_ALREADY_SENT' || code === 'GREETING_REPLY_REQUIRED' || code === 'CONVERSATION_STATE_CONFLICT' || code === 'IDEMPOTENCY_CONFLICT') return { status: 409, code }; if (code === 'MESSAGE_CONTENT_INVALID') return { status: 400, code }; return { status: 400, code }; }

export interface ConversationRouterOptions { readonly service: ConversationService; }

export function conversationRouter(options: ConversationRouterOptions, identity: IdentityRepositories): Router {
  const router = Router();
  router.use(requireActor(identity));
  router.get('/conversations', async (request, response) => { try { response.json({ items: (await options.service.listConversations(actorId(request))).map(conversationDto) }); } catch (error) { const mapped = mapError(error); problem(response, request, mapped.status, mapped.code); } });
  router.get('/conversations/:conversationId/messages', async (request, response) => {
    const id = conversationId.safeParse(request.params.conversationId); const query = messageHistoryQuery.safeParse(request.query);
    if (!id.success || !query.success) { problem(response, request, 400, 'INVALID_REQUEST'); return; }
    try { const items = await options.service.history(actorId(request), id.data, query.data.limit ?? 50, cursorDecode(query.data.cursor)); response.json({ items: items.map(messageDto), ...(items.length === (query.data.limit ?? 50) ? { nextCursor: cursorEncode(items[items.length - 1]!) } : {}) }); } catch (error) { const mapped = mapError(error); problem(response, request, mapped.status, mapped.code); }
  });
  router.post('/users/:userId/greetings', async (request, response) => {
    if (!mutationAllowed(request, response)) return;
    const target = conversationUserId.safeParse(request.params.userId); const parsed = greetingInput.safeParse(request.body);
    if (!target.success || !parsed.success) { problem(response, request, 400, 'INVALID_REQUEST'); return; }
    try { const result = await options.service.sendGreeting(actorId(request), parseUserId(target.data), parsed.data.content, command(request, { targetUserId: target.data, content: parsed.data.content })); response.status(201).json({ conversation: conversationDto(result.conversation), message: messageDto(result.message) }); } catch (error) { const mapped = mapError(error); problem(response, request, mapped.status, mapped.code); }
  });
  router.post('/conversations/:conversationId/reply', async (request, response) => {
    if (!mutationAllowed(request, response)) return;
    const id = conversationId.safeParse(request.params.conversationId); const parsed = replyInput.safeParse(request.body);
    if (!id.success || !parsed.success) { problem(response, request, 400, 'INVALID_REQUEST'); return; }
    try { const result = await options.service.replyToGreeting(actorId(request), id.data, parsed.data.content, command(request, { conversationId: id.data, content: parsed.data.content })); response.json({ conversation: conversationDto(result.conversation), message: messageDto(result.message) }); } catch (error) { const mapped = mapError(error); problem(response, request, mapped.status, mapped.code); }
  });
  router.post('/conversations/:conversationId/messages', async (request, response) => {
    if (!mutationAllowed(request, response)) return;
    const id = conversationId.safeParse(request.params.conversationId); const parsed = messageInput.safeParse(request.body);
    if (!id.success || !parsed.success) { problem(response, request, 400, 'INVALID_REQUEST'); return; }
    try { const idempotency = command(request, { conversationId: id.data, content: parsed.data.content }); const optionsInput = parsed.data.moderation ? { moderation: parsed.data.moderation, ...(idempotency ? { idempotency } : {}) } : (idempotency ? { idempotency } : {}); const result = await options.service.sendMessage(actorId(request), id.data, parsed.data.content, optionsInput); response.status(201).json(messageDto(result)); } catch (error) { const mapped = mapError(error); problem(response, request, mapped.status, mapped.code); }
  });
  router.post('/conversations/:conversationId/read', async (request, response) => {
    if (!mutationAllowed(request, response)) return;
    const id = conversationId.safeParse(request.params.conversationId); const parsed = readMessageInput.safeParse(request.body);
    if (!id.success || !parsed.success) { problem(response, request, 400, 'INVALID_REQUEST'); return; }
    try { await options.service.markRead(actorId(request), id.data, parsed.data.messageId); response.status(204).end(); } catch (error) { const mapped = mapError(error); problem(response, request, mapped.status, mapped.code); }
  });
  router.post('/conversations/:conversationId/typing', async (request, response) => {
    if (!mutationAllowed(request, response)) return;
    const id = conversationId.safeParse(request.params.conversationId); const parsed = typingInput.safeParse(request.body);
    if (!id.success || !parsed.success) { problem(response, request, 400, 'INVALID_REQUEST'); return; }
    try { await options.service.setTyping(actorId(request), id.data, parsed.data.active, parsed.data.ttlMs); response.status(204).end(); } catch (error) { const mapped = mapError(error); problem(response, request, mapped.status, mapped.code); }
  });
  router.get('/conversations/:conversationId/typing', async (request, response) => { const id = conversationId.safeParse(request.params.conversationId); if (!id.success) { problem(response, request, 400, 'INVALID_REQUEST'); return; } try { await options.service.history(actorId(request), id.data, 1); response.json({ items: await options.service.listTyping(id.data) }); } catch (error) { const mapped = mapError(error); problem(response, request, mapped.status, mapped.code); } });
  return router;
}
