import { z } from 'zod';

export const sessionDto = z.object({ id: z.string().uuid(), deviceName: z.string(), createdAt: z.string().datetime(), lastSeenAt: z.string().datetime(), current: z.boolean() });
export const sessionListResponse = z.object({ sessions: z.array(sessionDto) });
export const sessionExpired = z.object({ code: z.literal('SESSION_EXPIRED'), message: z.string() });
export type SessionDto = z.infer<typeof sessionDto>;
