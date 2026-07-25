import { parseFootprintId } from '@bliver/domain';

import type { FootprintOutboxEvent } from '../modules/footprints/index.js';
import type { MemoryProjectionEvent } from '../modules/memories/index.js';
import type {
  NotificationDto,
  NotificationEvent,
  NotificationPreferences,
} from '../modules/notifications/index.js';
import type { ClaimedOutboxEvent } from '../platform/outbox/index.js';

const discoveryEventTypes = new Set([
  'FootprintPublished',
  'FootprintVisibilityUpdated',
  'FootprintVisibilityChanged',
  'FootprintDeleted',
]);

const memoryEventTypes = new Set([
  'FootprintPublished',
  'FootprintVisibilityUpdated',
  'FootprintVisibilityChanged',
  'CommentAdded',
  'ReactionAdded',
]);

function isDiscoveryEventType(type: string): type is FootprintOutboxEvent['type'] {
  return discoveryEventTypes.has(type);
}

interface OutboxEventProcessorOptions {
  readonly conversation: (event: ClaimedOutboxEvent) => Promise<void>;
  readonly discovery: {
    process(event: FootprintOutboxEvent): Promise<void>;
  };
  readonly memories: {
    process(event: MemoryProjectionEvent): Promise<void>;
  };
  readonly notifications: {
    consume(event: NotificationEvent): Promise<NotificationDto | null>;
    recipientForEvent(event: NotificationEvent): string | null;
    getPreferences(userId: string): Promise<NotificationPreferences>;
  };
  readonly push?: {
    deliver(userId: string, notification: NotificationDto): Promise<unknown>;
  };
  readonly emitPublished: (payload: { readonly authorId: string }) => void;
  readonly emitDeleted: (payload: { readonly authorId: string }) => void;
}

export function createOutboxEventProcessor(options: OutboxEventProcessorOptions) {
  return async (event: ClaimedOutboxEvent): Promise<void> => {
    await options.conversation(event);

    if (isDiscoveryEventType(event.type)) {
      await options.discovery.process({
        id: event.id,
        type: event.type,
        aggregateId: parseFootprintId(event.aggregateId),
        payload: event.payload,
      });
    }

    if (memoryEventTypes.has(event.type)) {
      await options.memories.process(event);
    }

    const notificationEvent: NotificationEvent = {
      id: event.id,
      type: event.type,
      payload: event.payload,
    };
    const notification = await options.notifications.consume(notificationEvent);
    const recipientId = options.notifications.recipientForEvent(notificationEvent);
    if (
      notification
      && recipientId
      && options.push
      && (await options.notifications.getPreferences(recipientId)).push
    ) {
      await options.push.deliver(recipientId, notification);
    }

    if (event.type === 'FootprintPublished') {
      options.emitPublished(event.payload as { authorId: string });
    }
    if (event.type === 'FootprintDeleted' && typeof event.payload.authorId === 'string') {
      options.emitDeleted(event.payload as { authorId: string });
    }
  };
}
