import { z } from './zod.js';

export const mediaMimeType = z.string().trim().min(1).max(128);
export const mediaBytes = z.number().int().positive();

export const mediaSignatureRequest = z.object({
  mimeType: mediaMimeType,
  bytes: mediaBytes,
}).strict();

export const mediaSignatureResponse = z.object({
  assetId: z.string().min(1),
  publicId: z.string().min(1),
  signature: z.string().min(1),
  timestamp: z.number().int().positive(),
  apiKey: z.string().min(1),
  cloudName: z.string().min(1),
  version: z.number().int().positive().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  format: z.string().min(1).nullable(),
});

export type MediaSignatureRequest = z.infer<typeof mediaSignatureRequest>;
export type MediaSignatureResponse = z.infer<typeof mediaSignatureResponse>;
