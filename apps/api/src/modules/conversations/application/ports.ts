import type { EventId, UserId } from '@bliver/domain';

export type ConversationState = 'requested' | 'active' | 'ignored' | 'blocked';
export type MessageKind = 'greeting' | 'message';
export type ModerationStatus = 'pending' | 'clear' | 'blocked';

export interface ConversationRecord {
  readonly id: string;
  readonly participantLowId: UserId;
  readonly participantHighId: UserId;
  readonly initiatorId: UserId;
  readonly state: ConversationState;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MessageModerationMetadata {
  readonly status: ModerationStatus;
  readonly labels: readonly string[];
}

export interface MessageRecord {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: UserId;
  readonly content: string;
  readonly kind: MessageKind;
  readonly sentAt: Date;
  readonly eventId: EventId;
  readonly moderation: MessageModerationMetadata;
}

export interface MessageReceiptRecord {
  readonly conversationId: string;
  readonly messageId: string;
  readonly userId: UserId;
  readonly readAt: Date;
}

export interface TypingPresenceRecord {
  readonly conversationId: string;
  readonly userId: UserId;
  readonly active: boolean;
  readonly expiresAt: Date;
}

export interface ConversationEvent {
  readonly id: EventId;
  readonly type: 'GreetingSent' | 'ConversationUnlocked' | 'MessageSent' | 'MessageRead' | 'ConversationHidden' | 'ConversationBlocked';
  readonly aggregateId: string;
  readonly occurredAt: string;
  readonly payload: Record<string, unknown>;
}

export interface ConversationCommandIdempotency {
  readonly actorId: UserId;
  readonly scope: string;
  readonly key: string;
  readonly fingerprint: string;
}

export interface ConversationIdempotencyRecord {
  readonly fingerprint: string;
  readonly response: unknown;
}

export interface ConversationRepository {
  findById(id: string): Promise<ConversationRecord | null>;
  findByParticipants(left: UserId, right: UserId): Promise<ConversationRecord | null>;
  create(input: ConversationRecord): Promise<ConversationRecord>;
  updateState(id: string, state: ConversationState, at: Date): Promise<ConversationRecord>;
  hide(id: string, userId: UserId, at: Date): Promise<void>;
  saveMessage(input: MessageRecord): Promise<MessageRecord>;
  listMessages(id: string, limit: number, cursor?: { sentAt: Date; id: string }): Promise<MessageRecord[]>;
  saveReceipt(input: MessageReceiptRecord): Promise<void>;
  listReceipts(id: string): Promise<MessageReceiptRecord[]>;
  saveTyping(input: TypingPresenceRecord): Promise<void>;
  listTyping(id: string, now: Date): Promise<TypingPresenceRecord[]>;
  appendEvent(input: ConversationEvent): Promise<void>;
  findIdempotency(input: ConversationCommandIdempotency): Promise<ConversationIdempotencyRecord | null>;
  saveIdempotency(input: ConversationCommandIdempotency, response: unknown): Promise<unknown>;
}

export interface RelationshipQueryPort {
  areFriends(left: UserId, right: UserId): Promise<boolean>;
  isBlocked(left: UserId, right: UserId): Promise<boolean>;
}

export interface RelationshipCommandPort {
  block?(actor: UserId, target: UserId): Promise<void>;
}
