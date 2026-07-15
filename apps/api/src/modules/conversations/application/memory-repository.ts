import type { UserId } from '@bliver/domain';

import type {
  ConversationEvent,
  ConversationIdempotencyRecord,
  ConversationRecord,
  ConversationRepository,
  ConversationState,
  MessageReceiptRecord,
  MessageRecord,
  TypingPresenceRecord,
} from './ports.js';

const pair = (left: UserId, right: UserId): string => [left, right].sort().join(':');

export function createMemoryConversationRepository(): ConversationRepository {
  const conversations = new Map<string, ConversationRecord>();
  const pairs = new Map<string, string>();
  const hidden = new Set<string>();
  const messages = new Map<string, MessageRecord[]>();
  const receipts: MessageReceiptRecord[] = [];
  const typing = new Map<string, TypingPresenceRecord>();
  const events: ConversationEvent[] = [];
  const idempotency = new Map<string, ConversationIdempotencyRecord>();
  const repository: ConversationRepository = {
    async findById(id) { return conversations.get(id) ?? null; },
    async findByParticipants(left, right) { const id = pairs.get(pair(left, right)); return id ? conversations.get(id) ?? null : null; },
    async create(input) { const existing = await repository.findByParticipants(input.participantLowId, input.participantHighId); if (existing) return existing; conversations.set(input.id, input); pairs.set(pair(input.participantLowId, input.participantHighId), input.id); messages.set(input.id, []); return input; },
    async updateState(id, state: ConversationState, at) { const current = conversations.get(id); if (!current) throw new Error('CONVERSATION_NOT_FOUND'); const updated = { ...current, state, updatedAt: at }; conversations.set(id, updated); return updated; },
    async hide(id, userId) { hidden.add(`${id}:${userId}`); },
    async saveMessage(input) { const list = messages.get(input.conversationId); if (!list) throw new Error('CONVERSATION_NOT_FOUND'); list.push(input); return input; },
    async listMessages(id, limit, cursor) { const list = [...(messages.get(id) ?? [])].sort((left, right) => right.sentAt.getTime() - left.sentAt.getTime() || right.id.localeCompare(left.id)); const filtered = cursor ? list.filter((item) => item.sentAt < cursor.sentAt || (item.sentAt.getTime() === cursor.sentAt.getTime() && item.id < cursor.id)) : list; return filtered.slice(0, Math.max(1, Math.min(100, limit))); },
    async saveReceipt(input) { const index = receipts.findIndex((item) => item.conversationId === input.conversationId && item.messageId === input.messageId && item.userId === input.userId); if (index >= 0) receipts[index] = input; else receipts.push(input); },
    async listReceipts(id) { return receipts.filter((item) => item.conversationId === id); },
    async saveTyping(input) { typing.set(`${input.conversationId}:${input.userId}`, input); },
    async listTyping(id, now) { return [...typing.values()].filter((item) => item.conversationId === id && item.active && item.expiresAt > now); },
    async appendEvent(input) { events.push(input); },
    async findIdempotency(input) { return idempotency.get(`${input.actorId}:${input.scope}:${input.key}`) ?? null; },
    async saveIdempotency(input, response) { const key = `${input.actorId}:${input.scope}:${input.key}`; const prior = idempotency.get(key); if (prior && prior.fingerprint !== input.fingerprint) throw new Error('IDEMPOTENCY_CONFLICT'); if (prior) return prior.response; idempotency.set(key, { fingerprint: input.fingerprint, response }); return response; },
  };
  void hidden;
  void events;
  return repository;
}
