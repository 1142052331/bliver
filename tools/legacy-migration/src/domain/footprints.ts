import type { LegacyRecord } from '../adapters/fixture-source.js';
import type { VerifiedMedia } from '../adapters/cloudinary.js';
import { DeterministicIdRegistry } from './ids.js';

interface Point { readonly lat: number; readonly lng: number }
const point = (value: unknown): Point => { const item = value as { lat: unknown; lng: unknown }; return { lat: Number(item.lat), lng: Number(item.lng) }; };
const date = (value: unknown): Date => new Date(String(value));

export function transformFootprints(
  sources: readonly LegacyRecord[],
  verifiedMedia: ReadonlyMap<string, VerifiedMedia>,
  ids = new DeterministicIdRegistry(),
) {
  const regionByKey = new Map<string, { id: string; parentId: null; countryCode: string; regionCode: string; name: string; createdAt: Date; updatedAt: Date }>();
  const places: Array<Record<string, unknown>> = [];
  const mediaAssets: Array<Record<string, unknown>> = [];
  const footprintMedia: Array<Record<string, unknown>> = [];
  const discovery: Array<Record<string, unknown>> = [];
  const footprints = sources.map((source) => {
    const sourceId = String(source._id);
    const id = ids.id('footprint', sourceId);
    const authorId = ids.id('user', String(source.userId));
    const displayPoint = point(source.location);
    const privatePoint = source.realLocation && Number.isFinite(Number((source.realLocation as { lat?: unknown }).lat))
      ? point(source.realLocation)
      : displayPoint;
    const countryCode = String(source.countryCode ?? '').toUpperCase();
    const regionCode = String(source.regionCode ?? '');
    let regionId: string | null = null;
    if (/^[A-Z]{2}$/.test(countryCode) && regionCode) {
      const key = `${countryCode}:${regionCode.toUpperCase()}`;
      regionId = ids.id('region', key);
      if (!regionByKey.has(key)) regionByKey.set(key, { id: regionId, parentId: null, countryCode, regionCode: regionCode.toUpperCase(), name: String(source.regionName ?? regionCode), createdAt: date(source.createdAt), updatedAt: date(source.updatedAt) });
    }
    let placeId: string | null = null;
    if (String(source.placeName ?? '').trim()) {
      placeId = ids.id('place', sourceId);
      places.push({ id: placeId, regionId, name: String(source.placeName).trim(), countryCode: /^[A-Z]{2}$/.test(countryCode) ? countryCode : null, location: displayPoint, provider: 'legacy-mongo', providerPlaceId: sourceId, createdAt: date(source.createdAt), updatedAt: date(source.updatedAt) });
    }
    const media = verifiedMedia.get(sourceId);
    if (media) {
      const assetId = ids.id('media', sourceId);
      mediaAssets.push({ id: assetId, ownerId: authorId, ...media, createdAt: date(source.createdAt) });
      footprintMedia.push({ id: ids.id('footprint-media', sourceId), footprintId: id, assetId, position: 0, createdAt: date(source.createdAt), updatedAt: date(source.updatedAt) });
    }
    const visibility = source.visibility === undefined ? 'public' : String(source.visibility);
    const row = { id, authorId, placeId, regionId, privatePoint, displayPoint, visibility, locationPrecision: String(source.locationPrecision ?? 'approximate'), message: String(source.message ?? ''), mood: source.mood ? String(source.mood) : null, publishedAt: date(source.createdAt), discoveryExpiresAt: source.discoveryExpiresAt ? date(source.discoveryExpiresAt) : null, createdAt: date(source.createdAt), updatedAt: date(source.updatedAt), metadata: { weather: null } };
    discovery.push({ footprintId: id, authorId, regionId, countryCode: /^[A-Z]{2}$/.test(countryCode) ? countryCode : null, visibility, locationPrecision: row.locationPrecision, displayPoint, message: row.message, hasMedia: Boolean(media), publishedAt: row.publishedAt, discoveryExpiresAt: row.discoveryExpiresAt, deletedAt: null, updatedAt: row.updatedAt });
    return row;
  });
  return { regions: [...regionByKey.values()], places, mediaAssets, footprints, footprintMedia, discovery, outbox: [] as const };
}
