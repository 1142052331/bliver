import { describe, expect, it, vi } from 'vitest';
import { createFootprintId } from '@bliver/domain';

import type { NotificationDto } from '../../modules/notifications/index.js';
import type { ClaimedOutboxEvent } from '../../platform/outbox/index.js';
import { createOutboxEventProcessor } from '../outbox-processing.js';

function event(type: string, payload: Record<string, unknown> = {}): ClaimedOutboxEvent {
  return {
    id: 'event-1',
    type,
    aggregateId: createFootprintId(),
    payload,
    attempts: 1,
    claimedAt: 1,
  };
}

function dependencies() {
  return {
    conversation: vi.fn(async () => undefined),
    discovery: { process: vi.fn(async () => undefined) },
    memories: { process: vi.fn(async () => undefined) },
    notifications: {
      consume: vi.fn(async (): Promise<NotificationDto | null> => null),
      recipientForEvent: vi.fn((): string | null => null),
      getPreferences: vi.fn(async () => ({
        reactions: true,
        comments: true,
        social: true,
        messages: true,
        moderation: true,
        push: false,
      })),
    },
    push: { deliver: vi.fn(async () => undefined) },
    emitPublished: vi.fn(),
    emitDeleted: vi.fn(),
  };
}

describe('outbox event processing', () => {
  it('fans a published footprint out to projections, notifications, and realtime', async () => {
    const ports = dependencies();
    const published = event('FootprintPublished', { authorId: 'user-1' });

    await createOutboxEventProcessor(ports)(published);

    expect(ports.conversation).toHaveBeenCalledWith(published);
    expect(ports.discovery.process).toHaveBeenCalledWith({
      id: published.id,
      type: published.type,
      aggregateId: published.aggregateId,
      payload: published.payload,
    });
    expect(ports.memories.process).toHaveBeenCalledWith(published);
    expect(ports.notifications.consume).toHaveBeenCalledWith({
      id: published.id,
      type: published.type,
      payload: published.payload,
    });
    expect(ports.emitPublished).toHaveBeenCalledWith({ authorId: 'user-1' });
    expect(ports.emitDeleted).not.toHaveBeenCalled();
  });

  it('delivers push only when a notification and an opted-in recipient exist', async () => {
    const ports = dependencies();
    const notification = {
      id: 'notification-1',
      type: 'comment',
      target: { type: 'footprint', id: 'footprint-1' },
      createdAt: new Date(0).toISOString(),
    };
    ports.notifications.consume.mockResolvedValue(notification);
    ports.notifications.recipientForEvent.mockReturnValue('user-1');
    ports.notifications.getPreferences.mockResolvedValue({
      reactions: true,
      comments: true,
      social: true,
      messages: true,
      moderation: true,
      push: true,
    });

    await createOutboxEventProcessor(ports)(event('CommentAdded'));

    expect(ports.push.deliver).toHaveBeenCalledWith('user-1', notification);
    expect(ports.discovery.process).not.toHaveBeenCalled();
    expect(ports.memories.process).toHaveBeenCalledOnce();
  });

  it('emits deletion only for a valid author payload', async () => {
    const ports = dependencies();
    const process = createOutboxEventProcessor(ports);

    await process(event('FootprintDeleted', { authorId: 'user-1' }));
    await process(event('FootprintDeleted'));

    expect(ports.discovery.process).toHaveBeenCalledTimes(2);
    expect(ports.memories.process).not.toHaveBeenCalled();
    expect(ports.emitDeleted).toHaveBeenCalledOnce();
    expect(ports.emitDeleted).toHaveBeenCalledWith({ authorId: 'user-1' });
  });
});
