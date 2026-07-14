import { z } from './zod.js';

export const problemDetails = z
  .object({
    type: z.string().min(1).default('about:blank'),
    title: z.string().min(1),
    status: z.number().int().min(400).max(599),
    detail: z.string().min(1).optional(),
    instance: z.string().min(1).optional(),
    code: z.string().min(1),
    requestId: z.string().min(1).optional(),
  })
  .catchall(z.unknown());

export type ProblemDetails = z.infer<typeof problemDetails>;
