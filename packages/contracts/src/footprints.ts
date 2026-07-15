import { z } from './zod.js';

export const footprintVisibility = z.enum(['public', 'friends', 'private']);
export const footprintLocationPrecision = z.enum(['precise', 'approximate']);
export const geoPoint = z.object({ lat: z.number().finite().min(-90).max(90), lng: z.number().finite().min(-180).max(180) }).strict();
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
export const activityScope = z.enum(['smart', 'region', 'country', 'global']);
export const activityResolvedScope = z.enum(['region', 'country', 'global']);
export const activityRelationship = z.enum(['all', 'friends', 'public']);
export const activityContent = z.enum(['all', 'unread', 'media']);
export const activityQuery = z.object({
  scope: activityScope.default('smart'),
  relationship: activityRelationship.default('all'),
  content: activityContent.default('all'),
  query: z.string().trim().max(120).optional(),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
}).strict();
export const activityPageDto = z.object({
  items: z.array(footprintDto),
  nextCursor: z.string().max(512).optional(),
  resolvedScope: activityResolvedScope,
}).strict();
export const reactionEmoji = z.string().trim().min(1).max(32);
export const addReactionInput = z.object({ emoji: reactionEmoji }).strict();
export const reactionDto = z.object({ emoji: reactionEmoji, actorId: z.string().uuid(), createdAt: z.string().datetime() }).strict();
export const addCommentInput = z.object({ footprintId: z.string().uuid(), content: z.string().trim().min(1).max(2_000), parentCommentId: z.string().uuid().optional() }).strict();
export const commentDto = z.object({ id: z.string().uuid(), footprintId: z.string().uuid(), author: z.object({ id: z.string().uuid(), name: z.string() }).strict(), content: z.string(), parentCommentId: z.string().uuid().nullable(), createdAt: z.string().datetime(), deletedAt: z.string().datetime().nullable().optional(), replies: z.array(z.object({ id: z.string().uuid(), footprintId: z.string().uuid(), author: z.object({ id: z.string().uuid(), name: z.string() }).strict(), content: z.string(), parentCommentId: z.string().uuid(), createdAt: z.string().datetime(), deletedAt: z.string().datetime().nullable().optional() }).strict()).default([]) }).strict();
export const commentsResponse = z.object({ items: z.array(commentDto), nextCursor: z.string().max(512).optional() }).strict();
export const reportsReason = z.enum(['spam', 'harassment', 'hate', 'privacy', 'illegal', 'other']);
export const createReportInput = z.object({ footprintId: z.string().uuid(), reason: reportsReason, details: z.string().trim().max(1_000).optional() }).strict();
export const reportCreatedResponse = z.object({ id: z.string().uuid(), status: z.literal('open') }).strict();
export type FootprintDto = z.infer<typeof footprintDto>;
export type PublishFootprintRequest = z.infer<typeof publishFootprintRequest>;
export type UpdateFootprintVisibilityRequest = z.infer<typeof updateFootprintVisibilityRequest>;
export type FootprintRecordResponse = z.infer<typeof footprintRecordResponse>;
export type PublishFootprintResponse = z.infer<typeof publishFootprintResponse>;
export type ActivityQuery = z.infer<typeof activityQuery>;
export type ActivityPageDto = z.infer<typeof activityPageDto>;
export type AddCommentInput = z.infer<typeof addCommentInput>;
export type ReactionDto = z.infer<typeof reactionDto>;
export type CommentDto = z.infer<typeof commentDto>;
export type CreateReportInput = z.infer<typeof createReportInput>;
