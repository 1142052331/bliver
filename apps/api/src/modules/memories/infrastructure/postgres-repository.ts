import type { FootprintId, UserId } from '@bliver/domain';
import type { DatabaseClient } from '../../../platform/db/client.js';
import { buildCloudinaryImagePreview } from '../../../platform/media/cloudinary-delivery.js';
import type { MemoryMediaSource, MemoryRecordSource, VisitorSource } from '../domain/ports.js';
import type { MemoryProjectionRepository } from '../application/projection.js';

type Row = Record<string, unknown>;
export function createPostgresMemoryRepository(db: DatabaseClient, cloudName?: string): MemoryProjectionRepository {
  const selectMemory = (where: string): string => `SELECT f.id, f.author_id, u.display_name AS author_name, ST_Y(f.display_point::geometry) AS display_lat, ST_X(f.display_point::geometry) AS display_lng, f.visibility, f.location_precision, f.message, f.mood, f.published_at, f.discovery_expires_at, f.moderation_hidden_at, primary_media.public_id AS primary_media_public_id, primary_media.version AS primary_media_version, primary_media.width AS primary_media_width, primary_media.height AS primary_media_height, primary_media.format AS primary_media_format FROM footprints f JOIN identity_users u ON u.id=f.author_id LEFT JOIN LATERAL (SELECT ma.public_id, ma.version, ma.width, ma.height, ma.format FROM footprint_media fm JOIN media_assets ma ON ma.id=fm.asset_id WHERE fm.footprint_id=f.id AND ma.version IS NOT NULL AND ma.width IS NOT NULL AND ma.height IS NOT NULL AND ma.format IS NOT NULL ORDER BY fm.position ASC, ma.id ASC LIMIT 1) primary_media ON TRUE ${where}`;
  const source: MemoryRecordSource = {
    async listByOwner(ownerId) { const result = await db.query<Row>(`${selectMemory('WHERE f.author_id=$1')} ORDER BY f.published_at DESC, f.id DESC`, [ownerId]); return result.rows.map((row) => memoryRecord(row, cloudName)); },
    async findById(id) { const result = await db.query<Row>(selectMemory('WHERE f.id=$1'), [id]); return result.rows[0] ? memoryRecord(result.rows[0], cloudName) : null; },
  };
  return { ...source, async upsertFootprint() {}, async markEvent(eventId) { const result = await db.query<Row>('INSERT INTO platform.processed_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id', [eventId]); return Boolean(result.rowCount); }, async recordVisitor(ownerId, visitorId) { await db.query('INSERT INTO profile_visitors(owner_id,visitor_id) VALUES($1,$2) ON CONFLICT(owner_id,visitor_id) DO UPDATE SET last_visited_at=now(), visit_count=profile_visitors.visit_count+1', [ownerId, visitorId]); } };
}

function memoryRecord(row: Row, cloudName?: string) {
  const primaryMedia = row.primary_media_public_id == null
    ? null
    : buildCloudinaryImagePreview(cloudName, {
        publicId: String(row.primary_media_public_id),
        version: Number(row.primary_media_version),
        width: Number(row.primary_media_width),
        height: Number(row.primary_media_height),
        format: String(row.primary_media_format),
      });
  return { id: String(row.id) as FootprintId, authorId: String(row.author_id) as UserId, author: { name: String(row.author_name) }, displayPoint: { lat:Number(row.display_lat), lng:Number(row.display_lng) }, visibility: row.visibility as 'public'|'friends'|'private', locationPrecision: row.location_precision as 'precise'|'approximate', publishedAt:new Date(String(row.published_at)), discoveryExpiresAt:row.discovery_expires_at?new Date(String(row.discovery_expires_at)):null, moderationHiddenAt:row.moderation_hidden_at?new Date(String(row.moderation_hidden_at)):null, message:String(row.message), ...(row.mood ? { mood: String(row.mood) } : {}), ...(primaryMedia ? { primaryMedia } : {}) };
}

export function createPostgresMemoryMediaSource(db: DatabaseClient, cloudName?: string): MemoryMediaSource { return { async listForFootprints(ids) { if (!ids.length) return []; const result=await db.query<Row>('SELECT ma.id AS asset_id,fm.footprint_id,ma.public_id,ma.version,ma.format,ma.created_at FROM footprint_media fm JOIN media_assets ma ON ma.id=fm.asset_id WHERE fm.footprint_id=ANY($1::uuid[]) AND ma.version IS NOT NULL AND ma.format IS NOT NULL ORDER BY ma.created_at DESC,ma.id DESC',[ids]);return result.rows.map((row)=>{const publicId=String(row.public_id);const url=cloudName?`https://res.cloudinary.com/${encodeURIComponent(cloudName)}/image/upload/v${String(row.version)}/${publicId}.${String(row.format)}`:publicId;return{assetId:String(row.asset_id),footprintId:String(row.footprint_id) as FootprintId,url,createdAt:new Date(String(row.created_at))};});} }; }

export function createPostgresVisitorSource(db: DatabaseClient): VisitorSource { return { async list(ownerId) { const result=await db.query<Row>('SELECT pv.visitor_id,u.display_name,pv.last_visited_at FROM profile_visitors pv JOIN identity_users u ON u.id=pv.visitor_id WHERE pv.owner_id=$1 ORDER BY pv.last_visited_at DESC',[ownerId]);return result.rows.map((row)=>({id:String(row.visitor_id) as UserId,name:String(row.display_name),visitedAt:new Date(String(row.last_visited_at)).toISOString()}));},async record(ownerId,visitorId){await db.query('INSERT INTO profile_visitors(owner_id,visitor_id) VALUES($1,$2) ON CONFLICT(owner_id,visitor_id) DO UPDATE SET last_visited_at=now(),visit_count=profile_visitors.visit_count+1',[ownerId,visitorId]);},async isVisible(ownerId,viewer){return viewer?.userId===ownerId;} }; }
