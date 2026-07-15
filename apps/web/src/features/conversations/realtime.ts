import { messageDto, type MessageDto } from '@bliver/contracts';
import { io, type Socket } from 'socket.io-client';

export interface ConversationTypingEvent { readonly conversationId: string; readonly userId: string; readonly active: boolean; }
export interface ConversationReadEvent { readonly conversationId: string; readonly userId: string; readonly messageId: string; }
export interface ConversationRealtimeHandlers {
  readonly onMessage: (message: MessageDto) => void;
  readonly onTyping: (event: ConversationTypingEvent) => void;
  readonly onRead: (event: ConversationReadEvent) => void;
  readonly onReconnect: () => void;
  readonly onSessionExpired: () => void;
}

function typingEvent(value: unknown): ConversationTypingEvent | null { const raw = value as Record<string, unknown>; return typeof raw.conversationId === 'string' && typeof raw.userId === 'string' && typeof raw.active === 'boolean' ? { conversationId: raw.conversationId, userId: raw.userId, active: raw.active } : null; }
function readEvent(value: unknown): ConversationReadEvent | null { const raw = value as Record<string, unknown>; return typeof raw.conversationId === 'string' && typeof raw.userId === 'string' && typeof raw.messageId === 'string' ? { conversationId: raw.conversationId, userId: raw.userId, messageId: raw.messageId } : null; }

export interface ConversationRealtime {
  readonly sendMessage: (conversationId: string, content: string, idempotencyKey: string) => Promise<MessageDto>;
  readonly setTyping: (conversationId: string, active: boolean) => void;
  readonly markRead: (conversationId: string, messageId: string) => void;
  readonly disconnect: () => void;
}

export function connectConversationRealtime(handlers: ConversationRealtimeHandlers): ConversationRealtime {
  const socket: Socket = io('/', { transports: ['websocket'], withCredentials: true, autoConnect: true });
  const message = (value: unknown): void => { const parsed = messageDto.safeParse(value); if (parsed.success) handlers.onMessage(parsed.data); };
  const typing = (value: unknown): void => { const parsed = typingEvent(value); if (parsed) handlers.onTyping(parsed); };
  const read = (value: unknown): void => { const parsed = readEvent(value); if (parsed) handlers.onRead(parsed); };
  const connectError = (error: Error): void => { if (error.message.includes('AUTH_REQUIRED') || error.message.includes('SESSION_INVALID')) handlers.onSessionExpired(); };
  socket.on('conversation:message', message);
  socket.on('conversation:presence', typing);
  socket.on('conversation:read', read);
  socket.on('connect_error', connectError);
  socket.io.on('reconnect', handlers.onReconnect);
  return {
    sendMessage(conversationId, content, idempotencyKey) {
      return new Promise<MessageDto>((resolve, reject) => {
        const timeout = globalThis.setTimeout(() => reject(new Error('MESSAGE_TIMEOUT')), 8_000);
        socket.emit('conversation:message', { conversationId, content, idempotencyKey }, (acknowledgement: unknown) => {
          globalThis.clearTimeout(timeout);
          const ack = acknowledgement as { ok?: boolean; message?: unknown; code?: string };
          if (!ack.ok) { reject(new Error(ack.code ?? 'MESSAGE_SEND_FAILED')); return; }
          const parsed = messageDto.safeParse(ack.message);
          if (!parsed.success) { reject(new Error('MESSAGE_RESPONSE_INVALID')); return; }
          resolve(parsed.data);
        });
      });
    },
    setTyping(conversationId, active) { socket.emit('conversation:typing', { conversationId, active, ttlMs: active ? 5_000 : 0 }); },
    markRead(conversationId, messageId) { socket.emit('conversation:read', { conversationId, messageId }); },
    disconnect() { socket.off('conversation:message', message); socket.off('conversation:presence', typing); socket.off('conversation:read', read); socket.off('connect_error', connectError); socket.io.off('reconnect', handlers.onReconnect); socket.disconnect(); },
  };
}
