import { z } from './zod.js';

export const mapBounds = z.object({ west: z.coerce.number().finite(), south: z.coerce.number().min(-90).max(90), east: z.coerce.number().finite(), north: z.coerce.number().min(-90).max(90) }).strict();
export const mapFootprintQuery = mapBounds.extend({ cursor: z.string().max(512).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), visibility: z.enum(['public', 'friends', 'private']).optional() }).strict();
export const placeSearchRequest = z.object({ query: z.string().trim().min(1).max(120) }).strict();
export const locationResolveRequest = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict();
export type MapFootprintQuery = z.infer<typeof mapFootprintQuery>;
export type PlaceSearchRequest = z.infer<typeof placeSearchRequest>;
export type LocationResolveRequest = z.infer<typeof locationResolveRequest>;
