import { z } from 'zod';

export const memoryQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const memoryVisibility = z.enum(['public', 'friends', 'private']);

export const mediaPageDto = z.object({
  items: z.array(z.object({
    assetId: z.string(),
    footprintId: z.string(),
    url: z.string().url().or(z.string().min(1)),
    createdAt: z.string(),
  })),
  nextCursor: z.string().nullable().optional(),
});

export const memoryVisitorDto = z.object({ id: z.string(), name: z.string(), visitedAt: z.string() });
export const memorySummaryDto = z.object({ footprintCount: z.number().int().nonnegative(), photoCount: z.number().int().nonnegative(), visitorCount: z.number().int().nonnegative() });

export type MediaPageDto = z.infer<typeof mediaPageDto>;
export type MemoryVisitorDto = z.infer<typeof memoryVisitorDto>;
export type MemorySummaryDto = z.infer<typeof memorySummaryDto>;
