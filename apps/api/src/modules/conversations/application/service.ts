import { createEventId, createUserId, type UserId } from '@bliver/domain';

import type {
  ConversationCommandIdempotency,
  ConversationEvent,
  ConversationRecord,
  ConversationRepository,
  MessageModerationMetadata,
  MessageRecord,
  RelationshipCommandPort,
  RelationshipQueryPort,
} from './ports.js';

export type ConversationErrorCode =
  | 'CONVERSATION_NOT_FOUND'
  | 'GREETING_ALREADY_SENT'
  | 'GREETING_REPLY_REQUIRED'
  | 'CONVERSATION_STATE_CONFLICT'
  | 'MESSAGE_CONTENT_INVALID'
  | 'MESSAGE_FORBIDDEN'
  | 'IDEMPOTENCY_CONFLICT';

export class ConversationError extends Error {
  constructor(readonly code: ConversationErrorCode) { super(code); this.name = 'ConversationError'; }
}

export interface ConversationCommandOptions { readonly key: string; readonly fingerprint: string; }
export interface SendMessageOptions { readonly moderation?: MessageModerationMetadata; readonly idempotency?: ConversationCommandOptions; }
export interface ConversationServiceOptions { readonly now?: () => Date; readonly createId?: () => string; }

function event(type: ConversationEvent['type'], aggregateId: string, payload: Record<string, unknown>, at: Date): ConversationEvent {
  return { id: createEventId(), type, aggregateId, occurredAt: at.toISOString(), payload };
}

function content(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2_000) throw new ConversationError('MESSAGE_CONTENT_INVALID');
  return trimmed;
}

function participant(record: ConversationRecord, actor: UserId): boolean {
  return record.participantLowId === actor || record.participantHighId === actor;
}

export class ConversationService {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(private readonly repository: ConversationRepository, private readonly relationships: RelationshipQueryPort & RelationshipCommandPort, options: ConversationServiceOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? (() => createEventId());
  }

  async getOrCreateDirectConversation(actorId: UserId, targetId: UserId): Promise<ConversationRecord> {
    await this.assertVisible(actorId, targetId);
    const existing = await this.repository.findByParticipants(actorId, targetId);
    if (existing) return existing;
    if (!(await this.relationships.areFriends(actorId, targetId))) throw new ConversationError('CONVERSATION_NOT_FOUND');
    const at = this.now();
    const [participantLowId, participantHighId] = [actorId, targetId].sort() as [UserId, UserId];
    return this.repository.create({ id: this.createId(), participantLowId, participantHighId, initiatorId: actorId, state: 'active', createdAt: at, updatedAt: at });
  }

  async sendGreeting(actorId: UserId, targetId: UserId, text: string, options?: ConversationCommandOptions): Promise<{ conversation: ConversationRecord; message: MessageRecord }> {
    const idempotency = this.command(actorId, 'conversation.greeting', options);
    const replay = await this.replayPair(idempotency);
    if (replay) return replay as { conversation: ConversationRecord; message: MessageRecord };
    await this.assertVisible(actorId, targetId);
    const existing = await this.repository.findByParticipants(actorId, targetId);
    if (existing?.state === 'requested' && existing.initiatorId === actorId) throw new ConversationError('GREETING_ALREADY_SENT');
    if (existing?.state === 'ignored' || existing?.state === 'blocked') throw new ConversationError('CONVERSATION_NOT_FOUND');
    if (existing?.state === 'active') {
      const result = await this.createMessage(existing, actorId, text, 'message', undefined, idempotency);
      return this.savePairReplay(idempotency, result);
    }
    const at = this.now();
    const [participantLowId, participantHighId] = [actorId, targetId].sort() as [UserId, UserId];
    const conversation = { id: this.createId(), participantLowId, participantHighId, initiatorId: actorId, state: 'requested' as const, createdAt: at, updatedAt: at };
    const result = await this.createMessage(conversation, actorId, text, 'greeting', { type: 'GreetingSent', payload: {} }, idempotency, undefined, { createConversation: true });
    return this.savePairReplay(idempotency, result);
  }

  async replyToGreeting(actorId: UserId, conversationId: string, text: string, options?: ConversationCommandOptions): Promise<{ conversation: ConversationRecord; message: MessageRecord }> {
    const idempotency = this.command(actorId, 'conversation.reply', options);
    const replay = await this.replayPair(idempotency);
    if (replay) return replay as { conversation: ConversationRecord; message: MessageRecord };
    const conversation = await this.authorized(conversationId, actorId);
    if (conversation.state !== 'requested') throw new ConversationError('CONVERSATION_STATE_CONFLICT');
    if (conversation.initiatorId === actorId) throw new ConversationError('GREETING_REPLY_REQUIRED');
    const at = this.now();
    const updated = { ...conversation, state: 'active' as const, updatedAt: at };
    const result = await this.createMessage(updated, actorId, text, 'message', { type: 'ConversationUnlocked', payload: {} }, idempotency, undefined, { expectedState: 'requested' });
    return this.savePairReplay(idempotency, result);
  }

  async sendMessage(actorId: UserId, conversationId: string, text: string, options?: SendMessageOptions): Promise<MessageRecord> {
    const idempotency = this.command(actorId, 'conversation.message', options?.idempotency);
    const replay = await this.replayMessage(idempotency);
    if (replay) return replay;
    const conversation = await this.authorized(conversationId, actorId);
    if (conversation.state === 'requested') throw new ConversationError('GREETING_REPLY_REQUIRED');
    if (conversation.state !== 'active') throw new ConversationError('CONVERSATION_STATE_CONFLICT');
    const result = await this.createMessage(conversation, actorId, text, 'message', undefined, idempotency, options?.moderation);
    return this.saveMessageReplay(idempotency, result.message);
  }

  async ignoreConversation(actorId: UserId, conversationId: string): Promise<ConversationRecord> {
    const conversation = await this.authorized(conversationId, actorId);
    if (conversation.state !== 'requested' || conversation.initiatorId === actorId) throw new ConversationError('CONVERSATION_STATE_CONFLICT');
    const at = this.now();
    const updated = { ...conversation, state: 'ignored' as const, updatedAt: at };
    const hidden = event('ConversationHidden', conversation.id, { conversationId: conversation.id, userId: actorId }, at);
    if (this.repository.transactions) return this.repository.transactions.transitionState({ conversation: updated, expectedState: 'requested', event: hidden });
    const saved = await this.repository.updateState(conversation.id, 'ignored', at);
    await this.repository.appendEvent(hidden);
    return saved;
  }

  async hideConversation(actorId: UserId, conversationId: string): Promise<void> {
    await this.authorized(conversationId, actorId);
    const at = this.now();
    const hidden = event('ConversationHidden', conversationId, { conversationId, userId: actorId }, at);
    if (this.repository.transactions) await this.repository.transactions.hide({ conversationId, userId: actorId, at, event: hidden });
    else { await this.repository.hide(conversationId, actorId, at); await this.repository.appendEvent(hidden); }
  }

  async blockConversationUser(actorId: UserId, conversationId: string): Promise<ConversationRecord> {
    const conversation = await this.authorized(conversationId, actorId);
    const targetId = conversation.participantLowId === actorId ? conversation.participantHighId : conversation.participantLowId;
    if (this.relationships.block) await this.relationships.block(actorId, targetId);
    const at = this.now();
    const updated = { ...conversation, state: 'blocked' as const, updatedAt: at };
    const blocked = event('ConversationHidden', conversation.id, { conversationId, userId: actorId, targetId }, at);
    if (this.repository.transactions) return this.repository.transactions.transitionState({ conversation: updated, expectedState: conversation.state, event: blocked });
    const saved = await this.repository.updateState(conversation.id, 'blocked', at);
    await this.repository.appendEvent(blocked);
    return saved;
  }

  async markRead(actorId: UserId, conversationId: string, messageId: string): Promise<void> {
    const conversation = await this.authorized(conversationId, actorId);
    const messages = await this.repository.listMessages(conversation.id, 100);
    const message = messages.find((item) => item.id === messageId);
    if (!message) throw new ConversationError('CONVERSATION_NOT_FOUND');
    const at = this.now();
    const receipt = { conversationId, messageId, userId: actorId, readAt: at };
    const read = event('MessageRead', conversationId, { conversationId, messageId, userId: actorId }, at);
    if (this.repository.transactions) await this.repository.transactions.markRead({ receipt, event: read });
    else { await this.repository.saveReceipt(receipt); await this.repository.appendEvent(read); }
  }

  async setTyping(actorId: UserId, conversationId: string, active: boolean, ttlMs = 5_000): Promise<void> {
    const conversation = await this.authorized(conversationId, actorId);
    if (conversation.state !== 'active') throw new ConversationError('CONVERSATION_STATE_CONFLICT');
    const at = this.now();
    await this.repository.saveTyping({ conversationId, userId: actorId, active, expiresAt: new Date(at.getTime() + Math.max(0, Math.min(ttlMs, 30_000))) });
  }

  async listTyping(conversationId: string, now = this.now()) { return this.repository.listTyping(conversationId, now); }

  async history(actorId: UserId, conversationId: string, limit = 50, cursor?: { sentAt: Date; id: string }): Promise<MessageRecord[]> {
    await this.authorized(conversationId, actorId);
    return this.repository.listMessages(conversationId, limit, cursor);
  }

  async listConversations(actorId: UserId): Promise<ConversationRecord[]> {
    return this.repository.listForUser(actorId);
  }

  async getConversation(actorId: UserId, conversationId: string): Promise<ConversationRecord> {
    return this.authorized(conversationId, actorId);
  }

  private async createMessage(conversation: ConversationRecord, senderId: UserId, text: string, kind: MessageRecord['kind'], additional?: { type: ConversationEvent['type']; payload: Record<string, unknown> }, idempotency?: ConversationCommandIdempotency, moderation?: MessageModerationMetadata, transition?: { readonly createConversation?: boolean; readonly expectedState?: ConversationRecord['state'] }): Promise<{ conversation: ConversationRecord; message: MessageRecord }> {
    const at = this.now();
    const message: MessageRecord = { id: this.createId(), conversationId: conversation.id, senderId, content: content(text), kind, sentAt: at, eventId: createEventId(), moderation: moderation ?? { status: 'pending', labels: [] } };
    const emitted = event(additional?.type ?? 'MessageSent', conversation.id, { ...(additional?.payload ?? {}), conversationId: conversation.id, messageId: message.id, senderId }, at);
    if (this.repository.transactions) return this.repository.transactions.commitMessage({ conversation, message, event: emitted, ...(transition?.createConversation ? { createConversation: true } : {}), ...(transition?.expectedState ? { expectedState: transition.expectedState } : {}), ...(idempotency ? { idempotency } : {}) });
    let savedConversation = conversation;
    if (transition?.createConversation) savedConversation = await this.repository.create(conversation);
    if (transition?.expectedState) savedConversation = await this.repository.updateState(conversation.id, conversation.state, conversation.updatedAt);
    await this.repository.saveMessage(message);
    await this.repository.appendEvent(emitted);
    return { conversation: savedConversation, message };
  }

  private async authorized(conversationId: string, actorId: UserId): Promise<ConversationRecord> {
    const conversation = await this.repository.findById(conversationId);
    if (!conversation || !participant(conversation, actorId)) throw new ConversationError('CONVERSATION_NOT_FOUND');
    await this.assertVisible(actorId, conversation.participantLowId === actorId ? conversation.participantHighId : conversation.participantLowId);
    return conversation;
  }

  private async assertVisible(actorId: UserId, targetId: UserId): Promise<void> {
    if (actorId === targetId || await this.relationships.isBlocked(actorId, targetId)) throw new ConversationError('CONVERSATION_NOT_FOUND');
  }

  private command(actorId: UserId, scope: string, options?: ConversationCommandOptions): ConversationCommandIdempotency | undefined {
    return options ? { actorId, scope, key: options.key, fingerprint: options.fingerprint } : undefined;
  }

  private async replay(idempotency?: ConversationCommandIdempotency): Promise<unknown | null> {
    if (!idempotency) return null;
    const prior = await this.repository.findIdempotency(idempotency);
    if (!prior) return null;
    if (prior.fingerprint !== idempotency.fingerprint) throw new ConversationError('IDEMPOTENCY_CONFLICT');
    return prior.response;
  }

  private async replayPair(idempotency?: ConversationCommandIdempotency) { return this.replay(idempotency); }
  private async replayMessage(idempotency?: ConversationCommandIdempotency): Promise<MessageRecord | null> { const value = await this.replay(idempotency); if (!value) return null; const row = value as { message?: MessageRecord }; return row.message ?? value as MessageRecord; }
  private async savePairReplay(idempotency: ConversationCommandIdempotency | undefined, result: { conversation: ConversationRecord; message: MessageRecord }) { if (idempotency && !this.repository.transactions) await this.repository.saveIdempotency(idempotency, result); return result; }
  private async saveMessageReplay(idempotency: ConversationCommandIdempotency | undefined, result: MessageRecord) { if (idempotency && !this.repository.transactions) await this.repository.saveIdempotency(idempotency, result); return result; }
}

void createUserId;
