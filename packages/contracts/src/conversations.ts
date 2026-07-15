import { z } from './zod.js';

export const conversationState = z.enum(['requested', 'active', 'ignored', 'blocked']);
export const messageKind = z.enum(['greeting', 'message']);
export const moderationStatus = z.enum(['pending', 'clear', 'blocked']);
export const conversationId = z.string().uuid();
export const conversationUserId = z.string().uuid();

export const messageModeration = z.object({ status: moderationStatus, labels: z.array(z.string().max(64)).max(16) }).strict();
export const conversationDto = z.object({ id: conversationId, participantLowId: conversationUserId, participantHighId: conversationUserId, initiatorId: conversationUserId, state: conversationState, createdAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }) }).strict();
export const messageDto = z.object({ id: conversationId, conversationId, senderId: conversationUserId, content: z.string().min(1).max(2_000), kind: messageKind, sentAt: z.iso.datetime({ offset: true }), eventId: conversationId, moderation: messageModeration }).strict();
export const greetingInput = z.object({ content: z.string().trim().min(1).max(2_000) }).strict();
export const replyInput = greetingInput;
export const messageInput = z.object({ content: z.string().trim().min(1).max(2_000), moderation: messageModeration.optional() }).strict();
export const messageHistoryQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).optional(), cursor: z.string().optional() }).strict();
export const readMessageInput = z.object({ messageId: conversationId }).strict();
export const typingInput = z.object({ active: z.boolean(), ttlMs: z.number().int().min(0).max(30_000).optional() }).strict();
export const socketMessageInput = messageInput.extend({ conversationId, idempotencyKey: z.string().min(1).max(128).optional() }).strict();
export const socketTypingInput = typingInput.extend({ conversationId }).strict();
export const socketReadInput = readMessageInput.extend({ conversationId }).strict();

export type ConversationDto = z.infer<typeof conversationDto>;
export type MessageDto = z.infer<typeof messageDto>;
