import { z } from './zod.js';

export const healthResponse = z.object({
  status: z.literal('ok'),
  version: z.string().min(1),
  environment: z.string().min(1),
});

export type HealthResponse = z.infer<typeof healthResponse>;
