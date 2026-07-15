import { z } from 'zod';

export const moderationCaseStatus = z.enum(['open', 'resolved', 'dismissed']);
export const moderationCaseDto = z.object({ id: z.string(), reportId: z.string().optional(), status: moderationCaseStatus, targetType: z.string(), targetId: z.string(), reason: z.string(), createdAt: z.string(), resolvedAt: z.string().optional() });
export const moderationActionDto = z.object({ id: z.string(), caseId: z.string(), action: z.string(), actorId: z.string(), targetId: z.string(), reason: z.string(), createdAt: z.string() });
export type ModerationCaseDto = z.infer<typeof moderationCaseDto>;
export type ModerationActionDto = z.infer<typeof moderationActionDto>;
