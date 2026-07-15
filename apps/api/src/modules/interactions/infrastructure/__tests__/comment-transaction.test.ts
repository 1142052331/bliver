import { describe, expect, it, vi } from 'vitest';
import { createEventId, createFootprintId, createUserId } from '@bliver/domain';
import type { DatabaseClient, DatabaseQueryPort } from '../../../../platform/db/client.js';
import type { IdempotentCommentCommit } from '../../application/ports.js';
import { createPostgresInteractionRepository } from '../postgres-repository.js';

const actorId = createUserId();
const footprintId = createFootprintId();

function input(): IdempotentCommentCommit {
  const comment = { id: createEventId(), footprintId, authorId: actorId, authorName: 'Actor', content: 'once', parentCommentId: null, createdAt: new Date('2026-07-15T08:00:00.000Z'), deletedAt: null };
  return { actorId, scope: 'interaction.comment', key: 'key', fingerprint: 'fingerprint', comment, event: { id: createEventId(), type: 'CommentAdded', aggregateId: footprintId, payload: { commentId: comment.id } } };
}

function database(query: (statement: string) => Promise<unknown>): DatabaseClient {
  const client = { query: query as unknown as DatabaseQueryPort['query'] };
  return { query: client.query, async transaction<T>(callback: (client: DatabaseQueryPort) => Promise<T>) { return callback(client); } } as unknown as DatabaseClient;
}

describe('Postgres comment idempotency transaction', () => {
  it('reserves the key before writing the comment and Outbox in one transaction', async () => {
    const query = vi.fn(async (sql: string) => ({ rows: sql.startsWith('INSERT INTO platform.idempotency_keys') ? [{ request_hash: 'fingerprint', response: {} }] : [], rowCount: 1 }));
    const repository = createPostgresInteractionRepository(database(query));
    const result = await repository.commitComment!(input());
    expect(result.content).toBe('once');
    expect(query.mock.calls.map(([sql]) => String(sql))).toEqual([expect.stringContaining('INSERT INTO platform.idempotency_keys'), expect.stringContaining('INSERT INTO footprint_comments'), expect.stringContaining('INSERT INTO platform.outbox_events')]);
  });

  it('loads the committed winner without a second comment or Outbox mutation', async () => {
    const winner = input();
    const query = vi.fn(async (sql: string) => sql.startsWith('INSERT INTO platform.idempotency_keys') ? { rows: [], rowCount: 0 } : { rows: [{ request_hash: winner.fingerprint, response: winner.comment }], rowCount: 1 });
    const repository = createPostgresInteractionRepository(database(query));
    const result = await repository.commitComment!({ ...winner, comment: { ...winner.comment, id: createEventId() } });
    expect(result.id).toBe(winner.comment.id);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
