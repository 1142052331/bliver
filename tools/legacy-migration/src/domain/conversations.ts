import type { LegacyRecord } from '../adapters/fixture-source.js';
import { DeterministicIdRegistry } from './ids.js';
import { MigrationError } from './types.js';

const date = (value: unknown): Date => new Date(String(value));
const pairKey = (first: string, second: string): string => [first, second].sort().join(':');
const byId = <T extends { id: string }>(left: T, right: T): number => left.id.localeCompare(right.id);

export function transformConversations(
  conversationSources: readonly LegacyRecord[],
  messageSources: readonly LegacyRecord[],
  ids = new DeterministicIdRegistry(),
) {
  const conversationBySource = new Map<string, string>();
  const conversationByPair = new Map<string, string>();
  const sourceByConversation = new Map<string, LegacyRecord>();
  const conversations = conversationSources.map((source) => {
    const first = ids.id('user', String(source.userA));
    const second = ids.id('user', String(source.userB));
    const pair = pairKey(first, second);
    if (conversationByPair.has(pair)) throw new MigrationError('CONVERSATION_PAIR_CONFLICT');
    const id = ids.id('conversation', String(source._id));
    const [participantLowId, participantHighId] = [first, second].sort() as [string, string];
    const initiatorId = ids.id('user', String(source.pendingSenderId ?? source.userA));
    const row = { id, participantLowId, participantHighId, initiatorId, state: source.state === 'greeting_pending' ? 'requested' as const : 'active' as const, createdAt: date(source.createdAt), updatedAt: date(source.updatedAt ?? source.createdAt) };
    conversationBySource.set(String(source._id), id);
    conversationByPair.set(pair, id);
    sourceByConversation.set(id, source);
    return row;
  });

  const orderedMessages = [...messageSources].sort((left, right) => date(left.createdAt).getTime() - date(right.createdAt).getTime() || String(left._id).localeCompare(String(right._id)));
  for (const message of orderedMessages) {
    const senderId = ids.id('user', String(message.senderId));
    const receiverId = ids.id('user', String(message.receiverId));
    const pair = pairKey(senderId, receiverId);
    let conversationId = message.conversationId ? conversationBySource.get(String(message.conversationId)) : conversationByPair.get(pair);
    if (message.conversationId && !conversationId) throw new MigrationError('MESSAGE_CONVERSATION_MISSING');
    if (conversationId) {
      const conversation = conversations.find((row) => row.id === conversationId)!;
      if (pairKey(conversation.participantLowId, conversation.participantHighId) !== pair) throw new MigrationError('MESSAGE_PARTICIPANT_MISMATCH');
    } else {
      conversationId = ids.id('conversation', pair);
      const [participantLowId, participantHighId] = [senderId, receiverId].sort() as [string, string];
      conversations.push({ id: conversationId, participantLowId, participantHighId, initiatorId: senderId, state: message.kind === 'greeting' ? 'requested' : 'active', createdAt: date(message.createdAt), updatedAt: date(message.updatedAt ?? message.createdAt) });
      conversationByPair.set(pair, conversationId);
    }
  }

  const participants = conversations.flatMap((conversation) => {
    const source = sourceByConversation.get(conversation.id);
    const userA = source ? ids.id('user', String(source.userA)) : null;
    const hidden = (userId: string) => source
      ? userId === userA
        ? source.hiddenAtA ? date(source.hiddenAtA) : null
        : source.hiddenAtB ? date(source.hiddenAtB) : null
      : null;
    return [
      { id: `${conversation.id}:${conversation.participantLowId}`, conversationId: conversation.id, userId: conversation.participantLowId, hiddenAt: hidden(conversation.participantLowId) },
      { id: `${conversation.id}:${conversation.participantHighId}`, conversationId: conversation.id, userId: conversation.participantHighId, hiddenAt: hidden(conversation.participantHighId) },
    ];
  });
  const messages = orderedMessages.map((source) => {
    const senderId = ids.id('user', String(source.senderId));
    const receiverId = ids.id('user', String(source.receiverId));
    const conversationId = source.conversationId
      ? conversationBySource.get(String(source.conversationId))!
      : conversationByPair.get(pairKey(senderId, receiverId))!;
    return { id: ids.id('message', String(source._id)), conversationId, senderId, receiverId, content: String(source.content), kind: source.kind === 'greeting' ? 'greeting' as const : 'message' as const, sentAt: date(source.createdAt), eventId: ids.id('message-event', String(source._id)), moderationStatus: 'clear' as const, moderationLabels: [] as string[], readAt: source.isRead ? date(source.updatedAt ?? source.createdAt) : null };
  });
  for (const conversation of conversations) {
    const latest = messages.filter((message) => message.conversationId === conversation.id).reduce((value, message) => Math.max(value, message.sentAt.getTime()), conversation.updatedAt.getTime());
    conversation.updatedAt = new Date(latest);
    if (conversation.state === 'requested' && messages.some((message) => message.conversationId === conversation.id && message.kind === 'message')) conversation.state = 'active';
  }
  const receipts = messages.filter((message) => message.readAt).map((message) => ({ id: `${message.conversationId}:${message.id}:${message.receiverId}`, conversationId: message.conversationId, messageId: message.id, userId: message.receiverId, readAt: message.readAt! }));
  return {
    conversations: conversations.sort(byId),
    participants: participants.sort((left, right) => left.id.localeCompare(right.id)),
    messages: messages.sort(byId).map(({ receiverId: _receiverId, readAt: _readAt, ...message }) => message),
    receipts: receipts.sort((left, right) => left.id.localeCompare(right.id)).map(({ id: _id, ...receipt }) => receipt),
  };
}
