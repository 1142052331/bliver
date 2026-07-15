import { z } from './zod.js';

export const footprintVisibility = z.enum(['public', 'friends', 'private']);
export const footprintLocationPrecision = z.enum(['precise', 'approximate']);
export const geoPoint = z.object({ lat: z.number(), lng: z.number() }).strict();
export const footprintDto = z.object({ id: z.string().uuid(), author: z.object({ id: z.string().uuid(), name: z.string() }).passthrough(), displayPoint: geoPoint, visibility: footprintVisibility, locationPrecision: footprintLocationPrecision, message: z.string().optional(), publishedAt: z.string().datetime(), discoveryExpiresAt: z.string().datetime().optional() }).strict();
export const publishFootprintRequest = z.object({ message: z.string().min(1).max(2_000), mood: z.string().max(64).optional(), privatePoint: geoPoint, visibility: footprintVisibility, locationPrecision: footprintLocationPrecision, mediaAssetIds: z.array(z.string().uuid()).max(12).default([]) }).strict();
export const mapFootprintsResponse = z.object({ items: z.array(footprintDto), nextCursor: z.string().nullable() }).strict();
export const footprintPublishedEvent = z.object({ footprintId: z.string().uuid(), authorId: z.string().uuid() }).strict();
export type FootprintDto = z.infer<typeof footprintDto>;
export type PublishFootprintRequest = z.infer<typeof publishFootprintRequest>;
