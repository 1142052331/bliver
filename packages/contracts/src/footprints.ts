import { z } from './zod.js';

export const footprintVisibility = z.enum(['public', 'friends', 'private']);
export const footprintLocationPrecision = z.enum(['precise', 'approximate']);
export const geoPoint = z.object({ lat: z.number(), lng: z.number() }).strict();
export const footprintPublishedEvent = z.object({ footprintId: z.string().uuid(), authorId: z.string().uuid() }).strict();
export const footprintDto = z.object({ id: z.string().uuid(), author: z.object({ id: z.string().uuid(), name: z.string() }).passthrough(), displayPoint: geoPoint, visibility: footprintVisibility, locationPrecision: footprintLocationPrecision, message: z.string().optional(), publishedAt: z.string().datetime(), discoveryExpiresAt: z.string().datetime().optional() }).strict();
export const publishFootprintRequest = z.object({ message: z.string().min(1).max(2_000), mood: z.string().max(64).optional(), privatePoint: geoPoint, visibility: footprintVisibility, locationPrecision: footprintLocationPrecision, mediaAssetIds: z.array(z.string().uuid()).max(12).default([]), discoveryExpiresAt: z.string().datetime().nullable().optional() }).strict();
export const updateFootprintVisibilityRequest = z.object({ visibility: footprintVisibility }).strict();
export const footprintRecordResponse = z.object({
  id: z.string().uuid(),
  authorId: z.string().uuid(),
  privatePoint: geoPoint,
  displayPoint: geoPoint,
  visibility: footprintVisibility,
  locationPrecision: footprintLocationPrecision,
  message: z.string(),
  mood: z.string().optional(),
  mediaAssetIds: z.array(z.string().uuid()),
  metadata: z.object({ placeId: z.string().nullable(), regionId: z.string().nullable(), weather: z.unknown().nullable() }).strict(),
  publishedAt: z.string().datetime(),
  discoveryExpiresAt: z.string().datetime().nullable(),
}).strict();
export const footprintPublishedOutboxEvent = z.object({
  id: z.string().uuid(),
  type: z.literal('FootprintPublished'),
  aggregateId: z.string().uuid(),
  payload: footprintPublishedEvent,
}).strict();
export const publishFootprintResponse = z.object({ footprint: footprintRecordResponse, event: footprintPublishedOutboxEvent }).strict();
export const mapFootprintsResponse = z.object({ items: z.array(footprintDto), nextCursor: z.string().nullable() }).strict();
export type FootprintDto = z.infer<typeof footprintDto>;
export type PublishFootprintRequest = z.infer<typeof publishFootprintRequest>;
export type UpdateFootprintVisibilityRequest = z.infer<typeof updateFootprintVisibilityRequest>;
export type FootprintRecordResponse = z.infer<typeof footprintRecordResponse>;
export type PublishFootprintResponse = z.infer<typeof publishFootprintResponse>;
