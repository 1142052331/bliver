import { parseUserId, type UserId } from '@bliver/domain';

import type { DatabaseClient, DatabaseQueryPort } from '../../../platform/db/client.js';
import {
  canonicalUserPair,
  type BlockRecord,
  type FriendshipHistoryRecord,
  type FriendshipRecord,
  type FriendshipWriteInput,
  type RelationshipSummaryDto,
  type SocialEvent,
  type SocialCommandIdempotency,
  type SocialRepository,
} from '../application/ports.js';
import { SocialError } from '../application/service.js';

type Row = Record<string, unknown>;

function friendship(row: Row): FriendshipRecord {
  return {
    id: String(row.id),
    userLowId: parseUserId(String(row.user_low_id)),
    userHighId: parseUserId(String(row.user_high_id)),
    requesterId: parseUserId(String(row.requester_id)),
    addresseeId: parseUserId(String(row.addressee_id)),
    status: row.status as FriendshipRecord['status'],
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

function block(row: Row): BlockRecord {
  return { blockerId: parseUserId(String(row.blocker_id)), blockedId: parseUserId(String(row.blocked_id)), createdAt: new Date(String(row.created_at)) };
}

function socialEvent(row: Row): SocialEvent {
  return { id: String(row.id) as SocialEvent['id'], type: String(row.type) as SocialEvent['type'], aggregateId: String(row.aggregate_id), occurredAt: new Date(String(row.created_at)).toISOString(), payload: row.payload as Record<string, unknown> };
}

const friendshipColumns = 'id,user_low_id,user_high_id,requester_id,addressee_id,status,created_at,updated_at';

function storedFriendship(value: unknown): FriendshipRecord {
  const row = value as Record<string, unknown>;
  return {
    id: String(row.id),
    userLowId: parseUserId(String(row.userLowId ?? row.user_low_id)),
    userHighId: parseUserId(String(row.userHighId ?? row.user_high_id)),
    requesterId: parseUserId(String(row.requesterId ?? row.requester_id)),
    addresseeId: parseUserId(String(row.addresseeId ?? row.addressee_id)),
    status: String(row.status) as FriendshipRecord['status'],
    createdAt: new Date(String(row.createdAt ?? row.created_at)),
    updatedAt: new Date(String(row.updatedAt ?? row.updated_at)),
  };
}

function storedBlock(value: unknown): BlockRecord {
  const row = value as Record<string, unknown>;
  return { blockerId: parseUserId(String(row.blockerId ?? row.blocker_id)), blockedId: parseUserId(String(row.blockedId ?? row.blocked_id)), createdAt: new Date(String(row.createdAt ?? row.created_at)) };
}

async function insertOutbox(client: DatabaseQueryPort, item: SocialEvent): Promise<void> {
  await client.query('INSERT INTO platform.outbox_events (id,type,aggregate_id,payload,created_at) VALUES ($1,$2,$3,$4,$5)', [item.id, item.type, item.aggregateId, JSON.stringify(item.payload), new Date(item.occurredAt)]);
}

async function reserveIdempotency(client: DatabaseQueryPort, input: SocialCommandIdempotency): Promise<unknown | null> {
  const inserted = await client.query<Row>('INSERT INTO platform.idempotency_keys (actor_id,scope,key,request_hash,response) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (actor_id,scope,key) DO NOTHING RETURNING response', [input.actorId, input.scope, input.key, input.fingerprint, JSON.stringify(null)]);
  if (inserted.rowCount) return null;
  const prior = await client.query<Row>('SELECT request_hash,response FROM platform.idempotency_keys WHERE actor_id=$1 AND scope=$2 AND key=$3 FOR UPDATE', [input.actorId, input.scope, input.key]);
  const row = prior.rows[0];
  if (!row || String(row.request_hash) !== input.fingerprint) throw new SocialError('IDEMPOTENCY_CONFLICT');
  return row.response;
}

async function updateIdempotencyResponse(client: DatabaseQueryPort, input: SocialCommandIdempotency, response: unknown): Promise<void> {
  await client.query('UPDATE platform.idempotency_keys SET response=$4 WHERE actor_id=$1 AND scope=$2 AND key=$3', [input.actorId, input.scope, input.key, JSON.stringify(response)]);
}

async function writeFriendship(client: DatabaseQueryPort, input: FriendshipWriteInput): Promise<FriendshipRecord> {
  if (input.idempotency) {
    const replay = await reserveIdempotency(client, input.idempotency);
    if (replay !== null) return storedFriendship(replay);
  }
  if (input.history.fromStatus === null) {
    const inserted = await client.query<Row>(`INSERT INTO friendships (${friendshipColumns}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (user_low_id,user_high_id) DO NOTHING RETURNING ${friendshipColumns}`, [input.record.id, input.record.userLowId, input.record.userHighId, input.record.requesterId, input.record.addresseeId, input.record.status, input.record.createdAt, input.record.updatedAt]);
    if (!inserted.rowCount) {
      const winner = await client.query<Row>(`SELECT ${friendshipColumns} FROM friendships WHERE user_low_id=$1 AND user_high_id=$2`, [input.record.userLowId, input.record.userHighId]);
      if (!winner.rows[0]) throw new SocialError('FRIENDSHIP_STATE_CONFLICT');
      const result = friendship(winner.rows[0]);
      if (input.idempotency) await updateIdempotencyResponse(client, input.idempotency, result);
      return result;
    }
  } else {
    const result = await client.query(`UPDATE friendships SET requester_id=$2,addressee_id=$3,status=$4,updated_at=$5 WHERE id=$1 AND status=$6`, [input.record.id, input.record.requesterId, input.record.addresseeId, input.record.status, input.record.updatedAt, input.history.fromStatus]);
    if (!result.rowCount) throw new SocialError('FRIENDSHIP_STATE_CONFLICT');
  }
  await client.query('INSERT INTO friendship_status_history (id,friendship_id,from_status,to_status,actor_id,occurred_at) VALUES ($1,$2,$3,$4,$5,$6)', [input.history.id, input.history.friendshipId, input.history.fromStatus, input.history.toStatus, input.history.actorId, input.history.occurredAt]);
  if (input.event) await insertOutbox(client, input.event);
  if (input.idempotency) await updateIdempotencyResponse(client, input.idempotency, input.record);
  return input.record;
}

export interface PostgresSocialRepository extends SocialRepository {
  areAcceptedFriends(viewerId: UserId, authorId: UserId): Promise<boolean>;
  isEitherBlocked(viewerId: UserId, authorId: UserId): Promise<boolean>;
}

export function createPostgresSocialRepository(db: DatabaseClient): PostgresSocialRepository {
  const repository: PostgresSocialRepository = {
    async findFriendship(left, right) {
      const [low, high] = canonicalUserPair(left, right);
      const result = await db.query<Row>(`SELECT ${friendshipColumns} FROM friendships WHERE user_low_id=$1 AND user_high_id=$2`, [low, high]);
      return result.rows[0] ? friendship(result.rows[0]) : null;
    },
    async findFriendshipById(id) { const result = await db.query<Row>(`SELECT ${friendshipColumns} FROM friendships WHERE id=$1`, [id]); return result.rows[0] ? friendship(result.rows[0]) : null; },
    async findBlock(blockerId, blockedId) { const result = await db.query<Row>('SELECT blocker_id,blocked_id,created_at FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [blockerId, blockedId]); return result.rows[0] ? block(result.rows[0]) : null; },
    async listFriendships(userId) { const result = await db.query<Row>(`SELECT ${friendshipColumns} FROM friendships WHERE user_low_id=$1 OR user_high_id=$1 ORDER BY updated_at DESC,id DESC`, [userId]); return result.rows.map(friendship); },
    async listBlocks(blockerId) { const result = await db.query<Row>('SELECT blocker_id,blocked_id,created_at FROM blocks WHERE blocker_id=$1 ORDER BY created_at DESC,blocked_id', [blockerId]); return result.rows.map(block); },
    async findIdempotency(input) {
      const result = await db.query<Row>('SELECT request_hash,response FROM platform.idempotency_keys WHERE actor_id=$1 AND scope=$2 AND key=$3', [input.actorId, input.scope, input.key]);
      const row = result.rows[0];
      if (!row) return null;
      if (String(row.request_hash) !== input.fingerprint) throw new SocialError('IDEMPOTENCY_CONFLICT');
      return { fingerprint: String(row.request_hash), response: row.response };
    },
    async saveIdempotency(input, response) {
      return db.transaction(async (client) => {
        const replay = await reserveIdempotency(client, input);
        if (replay !== null) return replay;
        await updateIdempotencyResponse(client, input, response);
        return response;
      });
    },
    async writeFriendship(input) { return db.transaction(async (client) => writeFriendship(client, input)); },
    async removeFriendship(input) {
      await db.transaction(async (client) => {
        if (input.idempotency) {
          const replay = await reserveIdempotency(client, input.idempotency);
          if (replay !== null) return;
        }
        await client.query('DELETE FROM friendships WHERE id=$1', [input.record.id]);
        await insertOutbox(client, input.event);
        if (input.idempotency) await updateIdempotencyResponse(client, input.idempotency, { removed: true });
      });
    },
    async writeBlock(input) {
      return db.transaction(async (client) => {
        if (input.idempotency) {
          const replay = await reserveIdempotency(client, input.idempotency);
          if (replay !== null) return storedBlock(replay);
        }
        if (input.removedFriendship) {
          await client.query('DELETE FROM friendships WHERE id=$1', [input.removedFriendship.id]);
          if (input.friendshipRemovedEvent) await insertOutbox(client, input.friendshipRemovedEvent);
        }
        const inserted = await client.query<Row>('INSERT INTO blocks (blocker_id,blocked_id,created_at) VALUES ($1,$2,$3) ON CONFLICT (blocker_id,blocked_id) DO NOTHING RETURNING blocker_id,blocked_id,created_at', [input.record.blockerId, input.record.blockedId, input.record.createdAt]);
        if (!inserted.rowCount) {
          const winner = await client.query<Row>('SELECT blocker_id,blocked_id,created_at FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [input.record.blockerId, input.record.blockedId]);
          if (!winner.rows[0]) throw new SocialError('RELATIONSHIP_NOT_FOUND');
          const result = block(winner.rows[0]);
          if (input.idempotency) await updateIdempotencyResponse(client, input.idempotency, result);
          return result;
        }
        await insertOutbox(client, input.event);
        if (input.idempotency) await updateIdempotencyResponse(client, input.idempotency, input.record);
        return input.record;
      });
    },
    async removeBlock(input) { await db.transaction(async (client) => {
      if (input.idempotency) {
        const replay = await reserveIdempotency(client, input.idempotency);
        if (replay !== null) return;
      }
      await client.query('DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [input.record.blockerId, input.record.blockedId]);
      await insertOutbox(client, input.event);
      if (input.idempotency) await updateIdempotencyResponse(client, input.idempotency, { removed: true });
    }); },
    async listHistory(friendshipId) {
      const result = await db.query<Row>('SELECT id,friendship_id,from_status,to_status,actor_id,occurred_at FROM friendship_status_history WHERE friendship_id=$1 ORDER BY occurred_at,id', [friendshipId]);
      return result.rows.map((row): FriendshipHistoryRecord => ({ id: String(row.id), friendshipId: String(row.friendship_id), fromStatus: row.from_status as FriendshipHistoryRecord['fromStatus'], toStatus: row.to_status as FriendshipHistoryRecord['toStatus'], actorId: parseUserId(String(row.actor_id)), occurredAt: new Date(String(row.occurred_at)) }));
    },
    async listEvents() { const result = await db.query<Row>("SELECT id,type,aggregate_id,payload,created_at FROM platform.outbox_events WHERE type = ANY($1::text[]) ORDER BY created_at,id", [['FriendshipRequested', 'FriendshipAccepted', 'FriendshipRemoved', 'UserBlocked', 'UserUnblocked']]); return result.rows.map(socialEvent); },
    async areFriends(left, right) {
      const [low, high] = canonicalUserPair(left, right);
      const result = await db.query<Row>("SELECT true AS exists FROM friendships WHERE user_low_id=$1 AND user_high_id=$2 AND status='accepted' AND NOT EXISTS (SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)) LIMIT 1", [low, high]);
      return Boolean(result.rowCount);
    },
    async isBlocked(left, right) { const result = await db.query<Row>('SELECT true AS exists FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1', [left, right]); return Boolean(result.rowCount); },
    async getPendingRequest(left, right) { if (await repository.isBlocked(left, right)) return null; const item = await repository.findFriendship(left, right); return item?.status === 'pending' ? item : null; },
    async getRelationshipSummary(actor, target): Promise<RelationshipSummaryDto> {
      if (await repository.isBlocked(actor, target)) return { state: 'blocked' };
      const item = await repository.findFriendship(actor, target);
      if (!item || item.status === 'rejected') return { state: 'none' };
      if (item.status === 'accepted') return { state: 'friends' };
      return item.requesterId === actor ? { state: 'pending-outgoing', requestId: item.id } : { state: 'pending-incoming', requestId: item.id };
    },
    async areAcceptedFriends(viewerId, authorId) { return repository.areFriends(viewerId, authorId); },
    async isEitherBlocked(viewerId, authorId) { return repository.isBlocked(viewerId, authorId); },
  };
  return repository;
}
