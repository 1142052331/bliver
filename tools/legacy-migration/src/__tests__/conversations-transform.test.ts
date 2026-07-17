import { resolve } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';
import { version } from 'uuid';

import { FixtureSource, type LegacyCollections } from '../adapters/fixture-source.js';
import { transformConversations } from '../domain/conversations.js';

let source: LegacyCollections;
beforeEach(async () => { source = structuredClone(await (await FixtureSource.fromFile(resolve('fixtures/v1-complete.json'))).collections()); });

describe('legacy conversation transformation', () => {
  it('maps state, participants, messages and read receipts', () => {
    source.Conversation[0]!.pendingSenderId = '507f1f77bcf86cd799439012';
    source.Conversation[0]!.hiddenAtA = '2026-01-08T02:00:00.000Z';
    const result = transformConversations(source.Conversation, source.Message);
    const conversation = result.conversations[0]!;
    expect(conversation.state).toBe('active');
    expect(conversation.initiatorId).toBe(result.participants.find((row) => row.userId !== conversation.participantLowId)?.userId);
    expect(result.participants.filter((row) => row.conversationId === conversation.id)).toHaveLength(2);
    expect(result.participants.some((row) => row.hiddenAt?.toISOString() === '2026-01-08T02:00:00.000Z')).toBe(true);
    expect(result.messages.map((message) => message.kind)).toContain('message');
    expect(result.messages.every((message) => version(message.id) === 7 && version(message.eventId) === 7)).toBe(true);
    expect(result.messages.every((message) => message.moderationStatus === 'clear' && message.moderationLabels.length === 0)).toBe(true);
    expect(result.receipts).toHaveLength(1);
    expect(result.receipts[0]?.readAt.toISOString()).toBe('2026-01-06T02:00:00.000Z');
    expect(conversation.updatedAt.toISOString()).toBe('2026-01-08T01:00:00.000Z');
  });

  it('derives a deterministic conversation when no source conversation exists', () => {
    source.Conversation = [];
    source.Message = [{
      _id: '507f1f77bcf86cd799439184', conversationId: null,
      senderId: '507f1f77bcf86cd799439011', receiverId: '507f1f77bcf86cd799439013',
      content: 'hello', kind: 'greeting', isRead: false, createdAt: '2026-01-10T00:00:00.000Z',
    }];
    const result = transformConversations(source.Conversation, source.Message);
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0]?.state).toBe('requested');
    expect(result.messages[0]?.conversationId).toBe(result.conversations[0]?.id);
  });

  it('is input-order independent and blocks mismatched participants', () => {
    const forward = transformConversations(source.Conversation, source.Message);
    const reverse = transformConversations([...source.Conversation].reverse(), [...source.Message].reverse());
    expect(reverse).toEqual(forward);
    source.Message[0]!.receiverId = '507f1f77bcf86cd799439013';
    expect(() => transformConversations(source.Conversation, source.Message)).toThrow('MESSAGE_PARTICIPANT_MISMATCH');
  });
});
