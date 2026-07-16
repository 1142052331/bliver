import type { Server as SocketServer, Socket } from 'socket.io';

import { resolveSession } from '../modules/identity/application/commands.js';
import type { IdentityRepositories } from '../modules/identity/application/ports.js';
import { socketMessageInput, socketReadInput, socketTypingInput } from '@bliver/contracts';
import { parseUserId } from '@bliver/domain';
import type { ConversationService } from '../modules/conversations/index.js';
import type { ObservabilityRegistry } from '../platform/observability/index.js';

function observationId(value: string | string[] | undefined, fallback: string): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^[\w:.-]{1,128}$/.test(candidate) ? candidate : fallback;
}

function cookieToken(socket: Socket): string | undefined {
  const cookie = socket.request.headers.cookie ?? '';
  const value = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('bliver_session='));
  return value ? decodeURIComponent(value.slice('bliver_session='.length)) : undefined;
}

export interface ConversationRealtimeEmitter { to(room: string): { emit(event: string, payload: unknown): unknown }; }
export interface RealtimeDeliveryOptions { readonly deliveryDelayMs?: () => number; }
export function createConversationSocketHandlers(service: ConversationService, io: ConversationRealtimeEmitter, options: RealtimeDeliveryOptions = {}) {
  const deliver = async (conversation: { participantLowId: string; participantHighId: string }, event: string, payload: unknown): Promise<void> => {
    const delayMs = Math.max(0, Math.min(5_000, options.deliveryDelayMs?.() ?? 0));
    if (delayMs > 0) await new Promise<void>((resolve) => globalThis.setTimeout(resolve, delayMs));
    io.to(`user:${conversation.participantLowId}`).emit(event, payload);
    io.to(`user:${conversation.participantHighId}`).emit(event, payload);
  };
  return {
    async message(actorId: string, payload: unknown) {
      const parsed = socketMessageInput.safeParse(payload); if (!parsed.success) throw new Error('INVALID_REQUEST');
      const message = await service.sendMessage(parseUserId(actorId), parsed.data.conversationId, parsed.data.content, { ...(parsed.data.moderation ? { moderation: parsed.data.moderation } : {}), ...(parsed.data.idempotencyKey ? { idempotency: { key: parsed.data.idempotencyKey, fingerprint: JSON.stringify(parsed.data) } } : {}) });
      const conversation = await service.getConversation(parseUserId(actorId), parsed.data.conversationId);
      const dto = { ...message, senderId: message.senderId, sentAt: message.sentAt.toISOString() };
      await deliver(conversation, 'conversation:message', dto);
      return dto;
    },
    async typing(actorId: string, payload: unknown) {
      const parsed = socketTypingInput.safeParse(payload); if (!parsed.success) throw new Error('INVALID_REQUEST');
      await service.setTyping(parseUserId(actorId), parsed.data.conversationId, parsed.data.active, parsed.data.ttlMs);
      const conversation = await service.getConversation(parseUserId(actorId), parsed.data.conversationId);
      await deliver(conversation, 'conversation:presence', { conversationId: parsed.data.conversationId, userId: actorId, active: parsed.data.active });
      return { conversationId: parsed.data.conversationId, active: parsed.data.active };
    },
    async read(actorId: string, payload: unknown) {
      const parsed = socketReadInput.safeParse(payload); if (!parsed.success) throw new Error('INVALID_REQUEST');
      await service.markRead(parseUserId(actorId), parsed.data.conversationId, parsed.data.messageId);
      const conversation = await service.getConversation(parseUserId(actorId), parsed.data.conversationId);
      await deliver(conversation, 'conversation:read', { conversationId: parsed.data.conversationId, messageId: parsed.data.messageId, userId: actorId });
      return { conversationId: parsed.data.conversationId, messageId: parsed.data.messageId };
    },
  };
}

export function configureRealtime(io: SocketServer, identity: IdentityRepositories, conversations?: ConversationService, observability?: ObservabilityRegistry, deliveryOptions?: RealtimeDeliveryOptions): void {
  io.use(async (socket, next) => {
    const bearer = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : undefined;
    const token = bearer ?? cookieToken(socket);
    const requestId = observationId(socket.request.headers['x-request-id'], socket.id);
    const correlationId = observationId(socket.request.headers['x-correlation-id'], requestId);
    if (!token) { observability?.socket('auth_failure', { requestId, correlationId, status: 'AUTH_REQUIRED', durationMs: 0 }); next(new Error('AUTH_REQUIRED')); return; }
    const session = await resolveSession(identity, token);
    if (!session) { observability?.socket('auth_failure', { requestId, correlationId, status: 'AUTH_REQUIRED', durationMs: 0 }); next(new Error('AUTH_REQUIRED')); return; }
    socket.data.userId = session.user.id;
    socket.data.sessionToken = token;
    socket.data.requestId = requestId;
    socket.data.correlationId = correlationId;
    next();
  });
  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    const connectedAt = Date.now();
    const dimensions = { requestId: String(socket.data.requestId ?? socket.id), correlationId: String(socket.data.correlationId ?? socket.id), status: 'connected', durationMs: 0, ...(typeof userId === 'string' ? { actorId: userId } : {}) };
    observability?.socket(socket.recovered ? 'reconnect' : 'connection', dimensions);
    socket.on('disconnect', (reason) => observability?.socket('disconnect', { ...dimensions, status: reason, durationMs: Date.now() - connectedAt }));
    if (typeof userId === 'string') socket.join(`user:${userId}`);
    if (conversations && typeof userId === 'string') {
      const handlers = createConversationSocketHandlers(conversations, io, deliveryOptions);
      const ensureSession = async (): Promise<void> => { const token = socket.data.sessionToken; const session = typeof token === 'string' ? await resolveSession(identity, token) : null; if (!session || session.user.id !== userId) throw new Error('AUTH_REQUIRED'); };
      const failure = (acknowledge: ((result: unknown) => void) | undefined, error: unknown): void => { const code = error instanceof Error ? error.message : 'CONVERSATION_UNAVAILABLE'; observability?.socket(code === 'AUTH_REQUIRED' ? 'auth_failure' : 'disconnect', { ...dimensions, status: code, durationMs: Date.now() - connectedAt }); acknowledge?.({ ok: false, code }); if (code === 'AUTH_REQUIRED') socket.disconnect(true); };
      socket.on('conversation:message', (payload: unknown, acknowledge?: (result: unknown) => void) => { void ensureSession().then(() => handlers.message(userId, payload)).then((result) => acknowledge?.({ ok: true, message: result })).catch((error: unknown) => failure(acknowledge, error)); });
      socket.on('conversation:typing', (payload: unknown, acknowledge?: (result: unknown) => void) => { void ensureSession().then(() => handlers.typing(userId, payload)).then((result) => acknowledge?.({ ok: true, ...result })).catch((error: unknown) => failure(acknowledge, error)); });
      socket.on('conversation:read', (payload: unknown, acknowledge?: (result: unknown) => void) => { void ensureSession().then(() => handlers.read(userId, payload)).then((result) => acknowledge?.({ ok: true, ...result })).catch((error: unknown) => failure(acknowledge, error)); });
    }
  });
}

interface RealtimeEmitter { to(room: string): { emit(event: string, payload: unknown): unknown }; }
export function emitFootprintPublished(io: RealtimeEmitter, payload: { readonly authorId: string; readonly [key: string]: unknown }): void {
  io.to(`user:${payload.authorId}`).emit('footprint:published', payload);
}
