import type { DatabaseClient } from '../../../platform/db/client.js';
import { parseFootprintId, parseUserId } from '@bliver/domain';
import { buildCloudinaryImagePreview } from '../../../platform/media/cloudinary-delivery.js';
import type { DiscoveryAccessFilter, DiscoveryCandidateQuery, DiscoveryEntry, DiscoveryRepository } from '../application/ports.js';

type Row = Record<string, unknown>;
export interface PostgresDiscoveryRepository extends DiscoveryRepository {
  backfill(): Promise<void>;
}

const backfillSql = `INSERT INTO discovery_entries (
  footprint_id, author_id, region_id, country_code, visibility,
  location_precision, display_point, message, has_media, published_at,
  discovery_expires_at, deleted_at, updated_at
)
SELECT f.id, f.author_id, f.region_id, r.country_code, f.visibility,
  f.location_precision, f.display_point, f.message,
  EXISTS (
    SELECT 1 FROM footprint_media fm
    JOIN media_assets ma ON ma.id = fm.asset_id
    WHERE fm.footprint_id = f.id
      AND ma.version IS NOT NULL AND ma.width IS NOT NULL
      AND ma.height IS NOT NULL AND ma.format IS NOT NULL
  ), f.published_at, f.discovery_expires_at, NULL, now()
FROM footprints f
LEFT JOIN regions r ON r.id = f.region_id
WHERE f.moderation_hidden_at IS NULL
ON CONFLICT (footprint_id) DO UPDATE SET
  author_id = EXCLUDED.author_id,
  region_id = EXCLUDED.region_id,
  country_code = EXCLUDED.country_code,
  visibility = EXCLUDED.visibility,
  location_precision = EXCLUDED.location_precision,
  display_point = EXCLUDED.display_point,
  message = EXCLUDED.message,
  has_media = EXCLUDED.has_media,
  published_at = EXCLUDED.published_at,
  discovery_expires_at = EXCLUDED.discovery_expires_at,
  deleted_at = NULL,
  updated_at = now()`;
const toEntry = (row: Row, cloudName?: string): DiscoveryEntry => {
  const primaryMedia = row.primary_media_public_id == null
    ? null
    : buildCloudinaryImagePreview(cloudName, {
        publicId: String(row.primary_media_public_id),
        version: Number(row.primary_media_version),
        width: Number(row.primary_media_width),
        height: Number(row.primary_media_height),
        format: String(row.primary_media_format),
      });
  return {
  id: parseFootprintId(String(row.footprint_id)),
  authorId: parseUserId(String(row.author_id)),
  author: { name: String(row.author_name) },
  displayPoint: { lat: Number(row.display_lat), lng: Number(row.display_lng) },
  visibility: row.visibility as DiscoveryEntry['visibility'],
  locationPrecision: row.location_precision as DiscoveryEntry['locationPrecision'],
  publishedAt: new Date(String(row.published_at)),
  discoveryExpiresAt: row.discovery_expires_at ? new Date(String(row.discovery_expires_at)) : null,
  message: String(row.message ?? ''),
  ...(row.mood ? { mood: String(row.mood) } : {}),
  hasMedia: Boolean(row.has_media),
  regionId: row.region_id ? String(row.region_id) : null,
  countryCode: row.country_code ? String(row.country_code) : null,
  deletedAt: row.deleted_at ? new Date(String(row.deleted_at)) : null,
  ...(primaryMedia ? { primaryMedia } : {}),
  };
};

export function createPostgresDiscoveryRepository(db: DatabaseClient, options: { readonly accessFilter?: DiscoveryAccessFilter; readonly cloudName?: string } = {}): PostgresDiscoveryRepository {
  return {
    async listCandidates(input: DiscoveryCandidateQuery) {
      if (!input.actorId && input.relationship === 'friends') return [];
      const values: unknown[] = [];
      const add = (value: unknown): string => { values.push(value); return `$${values.length}`; };
      const predicates = ['d.deleted_at IS NULL'];
      if (!input.actorId) predicates.push(`d.visibility = 'public'`, 'd.discovery_expires_at > CURRENT_TIMESTAMP');
      else {
        const viewer = add(input.actorId);
        predicates.push(options.accessFilter?.({ actorId: input.actorId, actorParameter: viewer, authorColumn: 'd.author_id', visibilityColumn: 'd.visibility', discoveryExpiresAtColumn: 'd.discovery_expires_at', relationship: input.relationship }) ?? `d.author_id=${viewer}`);
        if (input.content === 'unread') predicates.push(`NOT EXISTS (SELECT 1 FROM discovery_reads rd WHERE rd.viewer_id=${viewer} AND rd.footprint_id=d.footprint_id)`);
      }
      if (input.scope === 'region' && input.regionId) predicates.push(`d.region_id = ${add(input.regionId)}`);
      if (input.scope === 'country' && input.countryCode) predicates.push(`d.country_code = ${add(input.countryCode)}`);
      if (input.excludeRegionId) predicates.push(`d.region_id IS DISTINCT FROM ${add(input.excludeRegionId)}`);
      if (input.excludeCountryCode) predicates.push(`d.country_code IS DISTINCT FROM ${add(input.excludeCountryCode)}`);
      if (input.relationship === 'public') predicates.push(`d.visibility = 'public'`);
      if (input.content === 'media') predicates.push('d.has_media = true');
      if (input.query) predicates.push(`d.message ILIKE ${add(`%${input.query}%`)}`);
      if (input.cursor) { const cursorDate = add(new Date(input.cursor.publishedAt)); const cursorId = add(input.cursor.id); predicates.push(`(d.published_at < ${cursorDate} OR (d.published_at = ${cursorDate} AND d.footprint_id < ${cursorId}))`); }
      const sql = `SELECT d.footprint_id, d.author_id, u.display_name AS author_name, ST_Y(d.display_point::geometry) AS display_lat, ST_X(d.display_point::geometry) AS display_lng, d.visibility, d.location_precision, d.message, source_footprint.mood, d.has_media, d.region_id, d.country_code, d.published_at, d.discovery_expires_at, d.deleted_at, primary_media.public_id AS primary_media_public_id, primary_media.version AS primary_media_version, primary_media.width AS primary_media_width, primary_media.height AS primary_media_height, primary_media.format AS primary_media_format FROM discovery_entries d JOIN footprints source_footprint ON source_footprint.id = d.footprint_id AND source_footprint.moderation_hidden_at IS NULL JOIN identity_users u ON u.id = d.author_id LEFT JOIN LATERAL (SELECT ma.public_id, ma.version, ma.width, ma.height, ma.format FROM footprint_media fm JOIN media_assets ma ON ma.id = fm.asset_id WHERE fm.footprint_id = d.footprint_id AND ma.version IS NOT NULL AND ma.width IS NOT NULL AND ma.height IS NOT NULL AND ma.format IS NOT NULL ORDER BY fm.position ASC, ma.id ASC LIMIT 1) primary_media ON TRUE WHERE ${predicates.join(' AND ')} ORDER BY d.published_at DESC, d.footprint_id DESC LIMIT ${add(Math.max(1, Math.min(101, Math.floor(input.limit))))}`;
      const result = await db.query<Row>(sql, values);
      return result.rows.map((row) => toEntry(row, options.cloudName));
    },
    async upsert(entry) {
      await db.query('INSERT INTO discovery_entries (footprint_id, author_id, region_id, country_code, visibility, location_precision, display_point, message, has_media, published_at, discovery_expires_at, deleted_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,ST_SetSRID(ST_MakePoint($7,$8),4326)::geography,$9,$10,$11,$12,$13,now()) ON CONFLICT (footprint_id) DO UPDATE SET author_id=EXCLUDED.author_id, region_id=EXCLUDED.region_id, country_code=EXCLUDED.country_code, visibility=EXCLUDED.visibility, location_precision=EXCLUDED.location_precision, display_point=EXCLUDED.display_point, message=EXCLUDED.message, has_media=EXCLUDED.has_media, published_at=EXCLUDED.published_at, discovery_expires_at=EXCLUDED.discovery_expires_at, deleted_at=EXCLUDED.deleted_at, updated_at=now()', [entry.id, entry.authorId, entry.regionId ?? null, entry.countryCode ?? null, entry.visibility, entry.locationPrecision, entry.displayPoint.lng, entry.displayPoint.lat, entry.message ?? '', entry.hasMedia ?? false, entry.publishedAt, entry.discoveryExpiresAt, entry.deletedAt ?? null]);
    },
    async remove(id) { await db.query('DELETE FROM discovery_entries WHERE footprint_id = $1', [id]); },
    async backfill() { await db.query(backfillSql); },
  };
}
