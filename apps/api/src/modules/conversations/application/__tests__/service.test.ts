import { createUserId } from '@bliver/domain';
import { describe, expect, it } from 'vitest';

import { ConversationService } from '../service.js';
import { createMemoryConversationRepository } from '../memory-repository.js';

function relationships(friends: readonly string[] = [], blocked: readonly string[] = []) {
  return {
    async areFriends(left: string, right: string) { return friends.includes([left, right].sort().join(':')); },
    async isBlocked(left: string, right: string) { return blocked.includes(`${left}:${right}`) || blocked.includes(`${right}:${left}`); },
    async getRelationshipSummary() { return { state: 'none' as const }; },
    async getPendingRequest() { return null; },
  };
}

describe('conversation state machine', () => {
  it('allows one stranger greeting and unlocks on recipient reply', async () => {
    const sender = createUserId();
    const recipient = createUserId();
    const service = new ConversationService(createMemoryConversationRepository(), relationships());

    const requested = await service.sendGreeting(sender, recipient, 'hello');
    expect(requested.conversation.state).toBe('requested');
    expect(requested.message.kind).toBe('greeting');
    await expect(service.sendGreeting(sender, recipient, 'again')).rejects.toMatchObject({ code: 'GREETING_ALREADY_SENT' });
    await expect(service.sendMessage(recipient, requested.conversation.id, 'not authorized')).rejects.toMatchObject({ code: 'GREETING_REPLY_REQUIRED' });

    const active = await service.replyToGreeting(recipient, requested.conversation.id, 'hi');
    expect(active.conversation.state).toBe('active');
    expect(active.message.senderId).toBe(recipient);
    await expect(service.replyToGreeting(recipient, requested.conversation.id, 'again')).rejects.toMatchObject({ code: 'CONVERSATION_STATE_CONFLICT' });
  });

  it('starts friends in active state and enforces participant authorization', async () => {
    const friend = createUserId();
    const other = createUserId();
    const outsider = createUserId();
    const pair = [friend, other].sort().join(':');
    const service = new ConversationService(createMemoryConversationRepository(), relationships([pair]));

    const conversation = await service.getOrCreateDirectConversation(friend, other);
    expect(conversation.state).toBe('active');
    const message = await service.sendMessage(friend, conversation.id, 'direct message');
    expect(message.content).toBe('direct message');
    await expect(service.sendMessage(outsider, conversation.id, 'intrusion')).rejects.toMatchObject({ code: 'CONVERSATION_NOT_FOUND' });
  });

  it('supports ignore, block, read receipts, typing expiry, and message moderation metadata', async () => {
    const sender = createUserId();
    const recipient = createUserId();
    let now = new Date('2026-07-15T08:00:00.000Z');
    let blocked = false;
    const relationship = {
      ...relationships(),
      async isBlocked() { return blocked; },
    };
    const repository = createMemoryConversationRepository();
    const service = new ConversationService(repository, relationship, { now: () => now });
    const requested = await service.sendGreeting(sender, recipient, 'hello');
    await service.ignoreConversation(recipient, requested.conversation.id);
    await expect(service.replyToGreeting(recipient, requested.conversation.id, 'no')).rejects.toMatchObject({ code: 'CONVERSATION_STATE_CONFLICT' });
    const friend = createUserId();
    const friendPair = [sender, friend].sort().join(':');
    const active = await new ConversationService(repository, { ...relationship, async areFriends(left: string, right: string) { return [left, right].sort().join(':') === friendPair; } }, { now: () => now }).getOrCreateDirectConversation(sender, friend);
    const message = await service.sendMessage(sender, active.id, 'clean', { moderation: { status: 'clear', labels: [] } });
    expect(message.moderation.status).toBe('clear');
    await service.markRead(friend, active.id, message.id);
    await expect(repository.listReceipts(active.id)).resolves.toEqual([expect.objectContaining({ messageId: message.id, userId: friend })]);
    await service.setTyping(friend, active.id, true, 5_000);
    await expect(service.listTyping(active.id, now)).resolves.toEqual([expect.objectContaining({ userId: friend, active: true })]);
    now = new Date(now.getTime() + 5_001);
    await expect(service.listTyping(active.id, now)).resolves.toEqual([]);
    blocked = true;
    await expect(service.sendMessage(sender, active.id, 'blocked')).rejects.toMatchObject({ code: 'CONVERSATION_NOT_FOUND' });
  });

  it('rejects empty or overlong content before persistence', async () => {
    const sender = createUserId();
    const recipient = createUserId();
    const pair = [sender, recipient].sort().join(':');
    const service = new ConversationService(createMemoryConversationRepository(), relationships([pair]));
    const conversation = await service.getOrCreateDirectConversation(sender, recipient);
    await expect(service.sendMessage(sender, conversation.id, ' ')).rejects.toMatchObject({ code: 'MESSAGE_CONTENT_INVALID' });
    await expect(service.sendMessage(sender, conversation.id, 'x'.repeat(2_001))).rejects.toMatchObject({ code: 'MESSAGE_CONTENT_INVALID' });
  });
});
