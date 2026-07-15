import type { DatabaseClient } from '../db/client.js';
import type { ClaimedOutboxEvent, OutboxRepository } from './index.js';

type Row = Record<string, unknown>;
export function createPostgresOutboxRepository(db: DatabaseClient): OutboxRepository {
  return {
    async append(event) { await db.query('INSERT INTO platform.outbox_events (id,type,aggregate_id,payload,available_at) VALUES ($1,$2,$3,$4,COALESCE($5,now()))', [event.id, event.type, event.aggregateId, JSON.stringify(event.payload), event.availableAt ? new Date(event.availableAt) : null]); },
    async claim(now) { const result = await db.query<Row>(`WITH next AS (SELECT id FROM platform.outbox_events WHERE processed_at IS NULL AND dead_lettered_at IS NULL AND claimed_at IS NULL AND available_at <= $1 ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE platform.outbox_events e SET claimed_at = $1, attempts = e.attempts + 1 FROM next WHERE e.id = next.id RETURNING e.id, e.type, e.aggregate_id, e.payload, e.attempts, EXTRACT(EPOCH FROM e.claimed_at) * 1000 AS claimed_at, EXTRACT(EPOCH FROM e.available_at) * 1000 AS available_at`, [new Date(now)]); const row = result.rows[0]; return row ? { id: String(row.id), type: String(row.type), aggregateId: String(row.aggregate_id), payload: row.payload as Record<string, unknown>, attempts: Number(row.attempts), claimedAt: Number(row.claimed_at), ...(row.available_at ? { availableAt: Number(row.available_at) } : {}) } as ClaimedOutboxEvent : null; },
    async markProcessed(id, at) { await db.query('UPDATE platform.outbox_events SET processed_at = $2, claimed_at = NULL WHERE id = $1', [id, new Date(at)]); },
    async markFailed(id, error, nextAvailableAt, deadLetteredAt) { await db.query('UPDATE platform.outbox_events SET claimed_at = NULL, last_error = $2, available_at = $3, dead_lettered_at = $4 WHERE id = $1', [id, error.slice(0, 1_000), new Date(nextAvailableAt), deadLetteredAt ? new Date(deadLetteredAt) : null]); },
  };
}
