import { z } from './zod.js';

export const mapBounds = z.object({ west: z.coerce.number().finite(), south: z.coerce.number().min(-90).max(90), east: z.coerce.number().finite(), north: z.coerce.number().min(-90).max(90) }).strict();
export const mapFootprintQuery = mapBounds.extend({ cursor: z.string().max(512).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), visibility: z.enum(['public', 'friends', 'private']).optional() }).strict();
export const placeSearchRequest = z.object({ query: z.string().trim().min(1).max(120) }).strict();
export const locationResolveRequest = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict();
export const placeDto = z.object({ id: z.string().min(1), name: z.string().min(1), lat: z.number(), lng: z.number(), countryCode: z.string().length(2).optional() }).strict();
export const placeSearchResponse = z.object({ items: z.array(placeDto), query: z.string() }).strict();
export const locationResolveResponse = z.object({
  latitude: z.number(),
  longitude: z.number(),
  place: placeDto.nullable(),
  region: z.object({ id: z.string().min(1), name: z.string().min(1) }).strict().nullable(),
  weather: z.record(z.string(), z.unknown()).nullable(),
}).strict();
export type MapFootprintQuery = z.infer<typeof mapFootprintQuery>;
export type PlaceSearchRequest = z.infer<typeof placeSearchRequest>;
export type LocationResolveRequest = z.infer<typeof locationResolveRequest>;
export type PlaceDto = z.infer<typeof placeDto>;
export type PlaceSearchResponse = z.infer<typeof placeSearchResponse>;
export type LocationResolveResponse = z.infer<typeof locationResolveResponse>;
