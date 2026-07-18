import { Pool } from 'pg';

import type { MigrationPlan } from '../domain/transform.js';

export interface QueryResult { readonly rows: readonly Record<string, unknown>[]; readonly rowCount: number }
export interface QueryClient { query(sql: string, values?: readonly unknown[]): Promise<QueryResult> }
export interface MigrationTarget {
  empty(): Promise<void>;
  transaction<T>(callback: (client: QueryClient) => Promise<T>): Promise<T>;
}

type Row = Record<string, unknown>;
type Point = { readonly lng: number; readonly lat: number };

const businessTables = [
  'identity_users', 'identity_credentials', 'identity_roles', 'admin_roles',
  'regions', 'places', 'media_assets', 'footprints', 'footprint_media', 'discovery_entries',
  'discovery_reads', 'footprint_reactions', 'footprint_comments', 'friendships',
  'friendship_status_history', 'blocks', 'conversations', 'conversation_participants',
  'messages', 'message_receipts', 'notifications', 'notification_preferences',
  'push_subscriptions', 'reports', 'profile_visitors', 'identity_devices', 'identity_sessions',
  'identity_security_events', 'memory_highlights', 'memory_projection_versions',
  'delivery_attempts', 'moderation_cases', 'moderation_actions', 'audit_logs',
  'platform.outbox_events', 'platform.processed_events',
] as const;

const planTables = {
  identityUsers: 'identity_users', identityCredentials: 'identity_credentials', identityRoles: 'identity_roles', adminRoles: 'admin_roles',
  regions: 'regions', places: 'places', mediaAssets: 'media_assets', footprints: 'footprints', footprintMedia: 'footprint_media', discovery: 'discovery_entries',
  reads: 'discovery_reads', reactions: 'footprint_reactions', comments: 'footprint_comments', friendships: 'friendships', history: 'friendship_status_history', blocks: 'blocks',
  conversations: 'conversations', participants: 'conversation_participants', messages: 'messages', receipts: 'message_receipts', notifications: 'notifications',
  pushSubscriptions: 'push_subscriptions', preferences: 'notification_preferences', reports: 'reports', profileVisitors: 'profile_visitors',
} as const;

function rows(plan: MigrationPlan, name: string): Row[] {
  const value = plan.rows[name];
  return Array.isArray(value) ? value as Row[] : [];
}

async function insert(client: QueryClient, sql: string, values: readonly unknown[]): Promise<void> {
  await client.query(sql, values);
}

function coordinates(value: unknown): [number, number] {
  const point = value as Point;
  return [Number(point.lng), Number(point.lat)];
}

export function createPostgresTarget(databaseUrl: string): MigrationTarget & { close(): Promise<void> } {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  return {
    async empty() {
      const union = businessTables.map((table) => `SELECT '${table}' AS table_name, count(*)::int AS row_count FROM ${table}`).join(' UNION ALL ');
      const result = await pool.query(union);
      if (result.rows.some((row) => Number(row.row_count) !== 0)) throw new Error('TARGET_NOT_EMPTY');
    },
    async transaction(callback) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        const result = await callback(client as unknown as QueryClient);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async close() { await pool.end(); },
  };
}

export async function loadMigration(target: MigrationTarget, plan: MigrationPlan): Promise<{ readonly digest: string }> {
  await target.empty();
  await target.transaction(async (client) => {
    for (const row of rows(plan, 'identityUsers')) await insert(client,
      'INSERT INTO identity_users (id,username,email,display_name,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [row.id, row.username, row.email, row.displayName, row.createdAt, row.updatedAt]);
    for (const row of rows(plan, 'identityCredentials')) await insert(client,
      'INSERT INTO identity_credentials (user_id,password_hash,created_at,updated_at) VALUES ($1,$2,$3,$4)',
      [row.userId, row.passwordHash, row.createdAt, row.updatedAt]);
    for (const row of rows(plan, 'identityRoles')) await insert(client,
      'INSERT INTO identity_roles (user_id,role,created_at) VALUES ($1,$2,$3)',
      [row.userId, row.role, row.createdAt]);
    for (const row of rows(plan, 'adminRoles')) await insert(client,
      'INSERT INTO admin_roles (user_id,role,granted_by,created_at) VALUES ($1,$2,$3,$4)',
      [row.userId, row.role, row.grantedBy, row.createdAt]);

    for (const row of rows(plan, 'regions')) await insert(client,
      'INSERT INTO regions (id,parent_id,country_code,region_code,name,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [row.id, row.parentId, row.countryCode, row.regionCode, row.name, row.createdAt, row.updatedAt]);
    for (const row of rows(plan, 'places')) {
      const [lng, lat] = coordinates(row.location);
      await insert(client,
        'INSERT INTO places (id,region_id,name,country_code,location,provider,provider_place_id,created_at,updated_at) VALUES ($1,$2,$3,$4,ST_SetSRID(ST_MakePoint($5,$6),4326)::geography,$7,$8,$9,$10)',
        [row.id, row.regionId, row.name, row.countryCode, lng, lat, row.provider, row.providerPlaceId, row.createdAt, row.updatedAt]);
    }
    for (const row of rows(plan, 'mediaAssets')) await insert(client,
      'INSERT INTO media_assets (id,owner_id,public_id,mime_type,bytes,version,width,height,format,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [row.id, row.ownerId, row.publicId, row.mimeType, row.bytes, row.version, row.width, row.height, row.format, row.createdAt]);
    for (const row of rows(plan, 'footprints')) {
      const [privateLng, privateLat] = coordinates(row.privatePoint);
      const [displayLng, displayLat] = coordinates(row.displayPoint);
      await insert(client,
        'INSERT INTO footprints (id,author_id,place_id,region_id,private_point,display_point,visibility,location_precision,message,mood,published_at,discovery_expires_at,created_at,updated_at,metadata) VALUES ($1,$2,$3,$4,ST_SetSRID(ST_MakePoint($5,$6),4326)::geography,ST_SetSRID(ST_MakePoint($7,$8),4326)::geography,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)',
        [row.id, row.authorId, row.placeId, row.regionId, privateLng, privateLat, displayLng, displayLat, row.visibility, row.locationPrecision, row.message, row.mood, row.publishedAt, row.discoveryExpiresAt, row.createdAt, row.updatedAt, JSON.stringify(row.metadata ?? {})]);
    }
    for (const row of rows(plan, 'footprintMedia')) await insert(client,
      'INSERT INTO footprint_media (id,footprint_id,asset_id,position,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [row.id, row.footprintId, row.assetId, row.position, row.createdAt, row.updatedAt]);
    for (const row of rows(plan, 'discovery')) {
      const [lng, lat] = coordinates(row.displayPoint);
      await insert(client,
        'INSERT INTO discovery_entries (footprint_id,author_id,region_id,country_code,visibility,location_precision,display_point,message,has_media,published_at,discovery_expires_at,deleted_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,ST_SetSRID(ST_MakePoint($7,$8),4326)::geography,$9,$10,$11,$12,$13,$14)',
        [row.footprintId, row.authorId, row.regionId, row.countryCode, row.visibility, row.locationPrecision, lng, lat, row.message, row.hasMedia, row.publishedAt, row.discoveryExpiresAt, row.deletedAt, row.updatedAt]);
    }

    for (const row of rows(plan, 'reads')) await insert(client,
      'INSERT INTO discovery_reads (footprint_id,viewer_id,read_at) VALUES ($1,$2,$3)',
      [row.footprintId, row.viewerId, row.readAt]);
    for (const row of rows(plan, 'reactions')) await insert(client,
      'INSERT INTO footprint_reactions (footprint_id,actor_id,emoji,created_at,updated_at) VALUES ($1,$2,$3,$4,$5)',
      [row.footprintId, row.actorId, row.emoji, row.createdAt, row.updatedAt]);
    const commentRows = rows(plan, 'comments').sort((left, right) => Number(Boolean(left.parentCommentId)) - Number(Boolean(right.parentCommentId)));
    for (const row of commentRows) await insert(client,
      'INSERT INTO footprint_comments (id,footprint_id,author_id,parent_comment_id,content,created_at,deleted_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [row.id, row.footprintId, row.authorId, row.parentCommentId, row.content, row.createdAt, row.deletedAt]);

    for (const row of rows(plan, 'friendships')) await insert(client,
      'INSERT INTO friendships (id,user_low_id,user_high_id,requester_id,addressee_id,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [row.id, row.userLowId, row.userHighId, row.requesterId, row.addresseeId, row.status, row.createdAt, row.updatedAt]);
    for (const row of rows(plan, 'history')) await insert(client,
      'INSERT INTO friendship_status_history (id,friendship_id,from_status,to_status,actor_id,occurred_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [row.id, row.friendshipId, row.fromStatus, row.toStatus, row.actorId, row.occurredAt]);
    for (const row of rows(plan, 'blocks')) await insert(client,
      'INSERT INTO blocks (blocker_id,blocked_id,created_at) VALUES ($1,$2,$3)',
      [row.blockerId, row.blockedId, row.createdAt]);

    for (const row of rows(plan, 'conversations')) await insert(client,
      'INSERT INTO conversations (id,participant_low_id,participant_high_id,initiator_id,state,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [row.id, row.participantLowId, row.participantHighId, row.initiatorId, row.state, row.createdAt, row.updatedAt]);
    for (const row of rows(plan, 'participants')) await insert(client,
      'INSERT INTO conversation_participants (conversation_id,user_id,hidden_at) VALUES ($1,$2,$3)',
      [row.conversationId, row.userId, row.hiddenAt]);
    for (const row of rows(plan, 'messages')) await insert(client,
      'INSERT INTO messages (id,conversation_id,sender_id,content,kind,sent_at,event_id,moderation_status,moderation_labels) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)',
      [row.id, row.conversationId, row.senderId, row.content, row.kind, row.sentAt, row.eventId, row.moderationStatus, JSON.stringify(row.moderationLabels ?? [])]);
    for (const row of rows(plan, 'receipts')) await insert(client,
      'INSERT INTO message_receipts (conversation_id,message_id,user_id,read_at) VALUES ($1,$2,$3,$4)',
      [row.conversationId, row.messageId, row.userId, row.readAt]);

    for (const row of rows(plan, 'notifications')) await insert(client,
      'INSERT INTO notifications (id,recipient_id,type,actor_id,target_type,target_id,payload,read_at,created_at,dedupe_key) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)',
      [row.id, row.recipientId, row.type, row.actorId, row.targetType, row.targetId, JSON.stringify(row.payload ?? {}), row.readAt, row.createdAt, row.dedupeKey]);
    for (const row of rows(plan, 'pushSubscriptions')) await insert(client,
      'INSERT INTO push_subscriptions (id,user_id,endpoint,p256dh,auth,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [row.id, row.userId, row.endpoint, row.p256dh, row.auth, row.createdAt, row.updatedAt]);
    for (const row of rows(plan, 'preferences')) await insert(client,
      'INSERT INTO notification_preferences (user_id,reactions,comments,social,messages,moderation,push,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [row.userId, row.reactions, row.comments, row.social, row.messages, row.moderation, row.push, row.updatedAt]);
    for (const row of rows(plan, 'reports')) await insert(client,
      'INSERT INTO reports (id,footprint_id,reporter_id,reason,details,status,created_at,resolved_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [row.id, row.footprintId, row.reporterId, row.reason, row.details, row.status, row.createdAt, row.resolvedAt]);
    for (const row of rows(plan, 'profileVisitors')) await insert(client,
      'INSERT INTO profile_visitors (owner_id,visitor_id,last_visited_at,visit_count) VALUES ($1,$2,$3,$4)',
      [row.ownerId, row.visitorId, row.lastVisitedAt, row.visitCount]);

    for (const [group, table] of Object.entries(planTables)) {
      const result = await client.query(`SELECT count(*)::int AS count FROM ${table}`);
      if (Number(result.rows[0]?.count ?? -1) !== rows(plan, group).length) throw new Error('TARGET_COUNT_MISMATCH');
    }
    for (const table of ['platform.outbox_events', 'delivery_attempts', 'audit_logs', 'platform.processed_events'] as const) {
      const result = await client.query(`SELECT count(*)::int AS count FROM ${table}`);
      if (Number(result.rows[0]?.count ?? -1) !== 0) throw new Error('TARGET_SIDE_EFFECT_DETECTED');
    }
  });
  return { digest: plan.digest };
}
