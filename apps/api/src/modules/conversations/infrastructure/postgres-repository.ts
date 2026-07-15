import { parseEventId, parseUserId } from '@bliver/domain';

import type { DatabaseClient, DatabaseQueryPort } from '../../../platform/db/client.js';
import { ConversationError } from '../application/service.js';
import type {
  ConversationCommandIdempotency,
  ConversationEvent,
  ConversationRecord,
  ConversationListRecord,
  ConversationRepository,
  ConversationState,
  MessageRecord,
} from '../application/ports.js';

type Row = Record<string, unknown>;

function conversation(row: Row): ConversationRecord {
  return { id: String(row.id), participantLowId: parseUserId(String(row.participant_low_id)), participantHighId: parseUserId(String(row.participant_high_id)), initiatorId: parseUserId(String(row.initiator_id)), state: String(row.state) as ConversationState, createdAt: new Date(String(row.created_at)), updatedAt: new Date(String(row.updated_at)) };
}

function message(row: Row): MessageRecord {
  return { id: String(row.id), conversationId: String(row.conversation_id), senderId: parseUserId(String(row.sender_id)), content: String(row.content), kind: String(row.kind) as MessageRecord['kind'], sentAt: new Date(String(row.sent_at)), eventId: parseEventId(String(row.event_id)), moderation: { status: String(row.moderation_status) as MessageRecord['moderation']['status'], labels: Array.isArray(row.moderation_labels) ? row.moderation_labels.map(String) : [] } };
}

function storedConversation(value: unknown): ConversationRecord {
  const row = value as Record<string, unknown>;
  return { id: String(row.id), participantLowId: parseUserId(String(row.participantLowId)), participantHighId: parseUserId(String(row.participantHighId)), initiatorId: parseUserId(String(row.initiatorId)), state: String(row.state) as ConversationState, createdAt: new Date(String(row.createdAt)), updatedAt: new Date(String(row.updatedAt)) };
}

function storedMessage(value: unknown): MessageRecord {
  const row = value as Record<string, unknown>;
  return { id: String(row.id), conversationId: String(row.conversationId), senderId: parseUserId(String(row.senderId)), content: String(row.content), kind: String(row.kind) as MessageRecord['kind'], sentAt: new Date(String(row.sentAt)), eventId: parseEventId(String(row.eventId)), moderation: { status: String((row.moderation as Record<string, unknown>)?.status) as MessageRecord['moderation']['status'], labels: Array.isArray((row.moderation as Record<string, unknown>)?.labels) ? ((row.moderation as Record<string, unknown>).labels as unknown[]).map(String) : [] } };
}

function storedPair(value: unknown): { conversation: ConversationRecord; message: MessageRecord } {
  const row = value as Record<string, unknown>;
  return { conversation: storedConversation(row.conversation), message: storedMessage(row.message) };
}

function listRecord(row: Row): ConversationListRecord {
  const item = conversation(row);
  const last = row.last_message && typeof row.last_message === 'object' ? message(row.last_message as Row) : undefined;
  return { ...item, unreadCount: Number(row.unread_count ?? 0), ...(last ? { lastMessage: last } : {}) };
}

async function outbox(client: DatabaseQueryPort, event: ConversationEvent): Promise<void> {
  await client.query('INSERT INTO platform.outbox_events (id,type,aggregate_id,payload,created_at) VALUES ($1,$2,$3,$4,$5)', [event.id, event.type, event.aggregateId, JSON.stringify(event.payload), new Date(event.occurredAt)]);
}

async function reserve(client: DatabaseQueryPort, input: ConversationCommandIdempotency): Promise<unknown | null> {
  const inserted = await client.query<Row>('INSERT INTO platform.idempotency_keys (actor_id,scope,key,request_hash,response) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (actor_id,scope,key) DO NOTHING RETURNING response', [input.actorId, input.scope, input.key, input.fingerprint, JSON.stringify(null)]);
  if (inserted.rowCount) return null;
  const prior = await client.query<Row>('SELECT request_hash,response FROM platform.idempotency_keys WHERE actor_id=$1 AND scope=$2 AND key=$3 FOR UPDATE', [input.actorId, input.scope, input.key]);
  const row = prior.rows[0];
  if (!row || String(row.request_hash) !== input.fingerprint) throw new ConversationError('IDEMPOTENCY_CONFLICT');
  return row.response;
}

async function updateReserved(client: DatabaseQueryPort, input: ConversationCommandIdempotency, response: unknown): Promise<void> {
  await client.query('UPDATE platform.idempotency_keys SET response=$4 WHERE actor_id=$1 AND scope=$2 AND key=$3', [input.actorId, input.scope, input.key, JSON.stringify(response)]);
}

export function createPostgresConversationRepository(db: DatabaseClient): ConversationRepository {
  const repository: ConversationRepository = {
    async findById(id) { const result = await db.query<Row>('SELECT id,participant_low_id,participant_high_id,initiator_id,state,created_at,updated_at FROM conversations WHERE id=$1', [id]); return result.rows[0] ? conversation(result.rows[0]) : null; },
    async findByParticipants(left, right) { const [low, high] = [left, right].sort(); const result = await db.query<Row>('SELECT id,participant_low_id,participant_high_id,initiator_id,state,created_at,updated_at FROM conversations WHERE participant_low_id=$1 AND participant_high_id=$2', [low, high]); return result.rows[0] ? conversation(result.rows[0]) : null; },
    async listForUser(userId) { const result = await db.query<Row>(`SELECT c.id,c.participant_low_id,c.participant_high_id,c.initiator_id,c.state,c.created_at,c.updated_at,
      (SELECT COUNT(*)::int FROM messages unread_message WHERE unread_message.conversation_id=c.id AND unread_message.sender_id<>$1 AND NOT EXISTS (SELECT 1 FROM message_receipts unread_receipt WHERE unread_receipt.conversation_id=unread_message.conversation_id AND unread_receipt.message_id=unread_message.id AND unread_receipt.user_id=$1)) AS unread_count,
      (SELECT json_build_object('id',last_message.id,'conversation_id',last_message.conversation_id,'sender_id',last_message.sender_id,'content',last_message.content,'kind',last_message.kind,'sent_at',last_message.sent_at,'event_id',last_message.event_id,'moderation_status',last_message.moderation_status,'moderation_labels',last_message.moderation_labels) FROM messages last_message WHERE last_message.conversation_id=c.id ORDER BY last_message.sent_at DESC,last_message.id DESC LIMIT 1) AS last_message
      FROM conversations c JOIN conversation_participants p ON p.conversation_id=c.id AND p.user_id=$1 WHERE p.hidden_at IS NULL ORDER BY c.updated_at DESC,c.id DESC`, [userId]); return result.rows.map(listRecord); },
    async create(input) {
      return db.transaction(async (client) => {
        const inserted = await client.query<Row>('INSERT INTO conversations (id,participant_low_id,participant_high_id,initiator_id,state,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (participant_low_id,participant_high_id) DO NOTHING RETURNING id,participant_low_id,participant_high_id,initiator_id,state,created_at,updated_at', [input.id, input.participantLowId, input.participantHighId, input.initiatorId, input.state, input.createdAt, input.updatedAt]);
        const saved = inserted.rows[0] ? conversation(inserted.rows[0]) : (await client.query<Row>('SELECT id,participant_low_id,participant_high_id,initiator_id,state,created_at,updated_at FROM conversations WHERE participant_low_id=$1 AND participant_high_id=$2', [input.participantLowId, input.participantHighId])).rows.map(conversation)[0];
        if (!saved) throw new ConversationError('CONVERSATION_NOT_FOUND');
        await client.query('INSERT INTO conversation_participants (conversation_id,user_id) VALUES ($1,$2),($1,$3) ON CONFLICT DO NOTHING', [saved.id, saved.participantLowId, saved.participantHighId]);
        return saved;
      });
    },
    async updateState(id, state, at) { const result = await db.query<Row>('UPDATE conversations SET state=$2,updated_at=$3 WHERE id=$1 RETURNING id,participant_low_id,participant_high_id,initiator_id,state,created_at,updated_at', [id, state, at]); if (!result.rows[0]) throw new ConversationError('CONVERSATION_NOT_FOUND'); return conversation(result.rows[0]); },
    async hide(id, userId, at) { await db.query('UPDATE conversation_participants SET hidden_at=$3 WHERE conversation_id=$1 AND user_id=$2', [id, userId, at]); },
    async saveMessage(input) { await db.query('INSERT INTO messages (id,conversation_id,sender_id,content,kind,sent_at,event_id,moderation_status,moderation_labels) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [input.id, input.conversationId, input.senderId, input.content, input.kind, input.sentAt, input.eventId, input.moderation.status, JSON.stringify(input.moderation.labels)]); return input; },
    async listMessages(id, limit, cursor) {
      const values: unknown[] = [id];
      let predicate = 'conversation_id=$1';
      if (cursor) { values.push(cursor.sentAt, cursor.id); predicate += ` AND (sent_at < $${values.length - 1} OR (sent_at = $${values.length - 1} AND id < $${values.length}))`; }
      values.push(Math.max(1, Math.min(100, limit)));
      const result = await db.query<Row>(`SELECT id,conversation_id,sender_id,content,kind,sent_at,event_id,moderation_status,moderation_labels FROM messages WHERE ${predicate} ORDER BY sent_at DESC,id DESC LIMIT $${values.length}`, values);
      return result.rows.map(message);
    },
    async saveReceipt(input) { await db.query('INSERT INTO message_receipts (conversation_id,message_id,user_id,read_at) VALUES ($1,$2,$3,$4) ON CONFLICT (conversation_id,message_id,user_id) DO UPDATE SET read_at=EXCLUDED.read_at', [input.conversationId, input.messageId, input.userId, input.readAt]); },
    async listReceipts(id) { const result = await db.query<Row>('SELECT conversation_id,message_id,user_id,read_at FROM message_receipts WHERE conversation_id=$1', [id]); return result.rows.map((row) => ({ conversationId: String(row.conversation_id), messageId: String(row.message_id), userId: parseUserId(String(row.user_id)), readAt: new Date(String(row.read_at)) })); },
    async saveTyping(input) { await db.query('INSERT INTO typing_presence (conversation_id,user_id,active,expires_at) VALUES ($1,$2,$3,$4) ON CONFLICT (conversation_id,user_id) DO UPDATE SET active=EXCLUDED.active,expires_at=EXCLUDED.expires_at', [input.conversationId, input.userId, input.active, input.expiresAt]); },
    async listTyping(id, now) { const result = await db.query<Row>('SELECT conversation_id,user_id,active,expires_at FROM typing_presence WHERE conversation_id=$1 AND active=true AND expires_at>$2', [id, now]); return result.rows.map((row) => ({ conversationId: String(row.conversation_id), userId: parseUserId(String(row.user_id)), active: Boolean(row.active), expiresAt: new Date(String(row.expires_at)) })); },
    async appendEvent(input) { await outbox(db, input); },
    async findIdempotency(input) { const result = await db.query<Row>('SELECT request_hash,response FROM platform.idempotency_keys WHERE actor_id=$1 AND scope=$2 AND key=$3', [input.actorId, input.scope, input.key]); const row = result.rows[0]; if (!row) return null; if (String(row.request_hash) !== input.fingerprint) throw new ConversationError('IDEMPOTENCY_CONFLICT'); return { fingerprint: String(row.request_hash), response: row.response }; },
    async saveIdempotency(input, response) { return db.transaction(async (client) => { const replay = await reserve(client, input); if (replay !== null) return replay; await updateReserved(client, input, response); return response; }); },
    transactions: {
      async commitMessage(input) {
        return db.transaction(async (client) => {
          if (input.idempotency) { const replay = await reserve(client, input.idempotency); if (replay !== null) return storedPair(replay); }
          let savedConversation: ConversationRecord;
          if (input.createConversation) {
            const inserted = await client.query<Row>('INSERT INTO conversations (id,participant_low_id,participant_high_id,initiator_id,state,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (participant_low_id,participant_high_id) DO NOTHING RETURNING id,participant_low_id,participant_high_id,initiator_id,state,created_at,updated_at', [input.conversation.id, input.conversation.participantLowId, input.conversation.participantHighId, input.conversation.initiatorId, input.conversation.state, input.conversation.createdAt, input.conversation.updatedAt]);
            if (!inserted.rows[0]) throw new ConversationError('GREETING_ALREADY_SENT');
            savedConversation = conversation(inserted.rows[0]);
            await client.query('INSERT INTO conversation_participants (conversation_id,user_id) VALUES ($1,$2),($1,$3)', [savedConversation.id, savedConversation.participantLowId, savedConversation.participantHighId]);
          } else savedConversation = input.conversation;
          if (input.expectedState) {
            const updated = await client.query<Row>('UPDATE conversations SET state=$2,updated_at=$3 WHERE id=$1 AND state=$4 RETURNING id,participant_low_id,participant_high_id,initiator_id,state,created_at,updated_at', [savedConversation.id, input.conversation.state, input.conversation.updatedAt, input.expectedState]);
            if (!updated.rows[0]) throw new ConversationError('CONVERSATION_STATE_CONFLICT');
            savedConversation = conversation(updated.rows[0]);
          }
          await client.query('INSERT INTO messages (id,conversation_id,sender_id,content,kind,sent_at,event_id,moderation_status,moderation_labels) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [input.message.id, input.message.conversationId, input.message.senderId, input.message.content, input.message.kind, input.message.sentAt, input.message.eventId, input.message.moderation.status, JSON.stringify(input.message.moderation.labels)]);
          await outbox(client, input.event);
          const result = { conversation: savedConversation, message: input.message };
          if (input.idempotency) await updateReserved(client, input.idempotency, result);
          return result;
        });
      },
      async transitionState(input) {
        return db.transaction(async (client) => {
          const result = await client.query<Row>('UPDATE conversations SET state=$2,updated_at=$3 WHERE id=$1 AND state=$4 RETURNING id,participant_low_id,participant_high_id,initiator_id,state,created_at,updated_at', [input.conversation.id, input.conversation.state, input.conversation.updatedAt, input.expectedState]);
          if (!result.rows[0]) throw new ConversationError('CONVERSATION_STATE_CONFLICT');
          await outbox(client, input.event);
          return conversation(result.rows[0]);
        });
      },
      async hide(input) { await db.transaction(async (client) => { await client.query('UPDATE conversation_participants SET hidden_at=$3 WHERE conversation_id=$1 AND user_id=$2', [input.conversationId, input.userId, input.at]); await outbox(client, input.event); }); },
      async markRead(input) { await db.transaction(async (client) => { const existing = await client.query('SELECT 1 FROM message_receipts WHERE conversation_id=$1 AND message_id=$2 AND user_id=$3', [input.receipt.conversationId, input.receipt.messageId, input.receipt.userId]); if (existing.rowCount) return; await client.query('INSERT INTO message_receipts (conversation_id,message_id,user_id,read_at) VALUES ($1,$2,$3,$4)', [input.receipt.conversationId, input.receipt.messageId, input.receipt.userId, input.receipt.readAt]); await outbox(client, input.event); }); },
    },
  };
  return repository;
}
