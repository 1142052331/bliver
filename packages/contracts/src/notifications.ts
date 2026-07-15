import { z } from 'zod';

export const notificationType = z.enum(['reaction', 'comment', 'friendship', 'greeting', 'message', 'report', 'admin']);
export const notificationDto = z.object({
  id: z.string(),
  type: z.string(),
  actor: z.object({ id: z.string(), name: z.string() }).optional(),
  target: z.object({ type: z.string(), id: z.string() }),
  readAt: z.string().optional(),
  createdAt: z.string(),
});
export const notificationPage = z.object({ items: z.array(notificationDto), unreadCount: z.number().int().nonnegative(), nextCursor: z.string().nullable().optional() });
export const notificationPreferences = z.object({ reactions: z.boolean(), comments: z.boolean(), social: z.boolean(), messages: z.boolean(), moderation: z.boolean(), push: z.boolean() });
export type NotificationDto = z.infer<typeof notificationDto>;
export type NotificationPreferences = z.infer<typeof notificationPreferences>;
