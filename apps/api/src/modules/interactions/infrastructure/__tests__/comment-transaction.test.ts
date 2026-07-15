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

  it('writes each interaction mutation and its Outbox event through one transaction port', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
    const repository = createPostgresInteractionRepository(database(query));
    const value = input();
    await repository.transactions!.addReaction({ reaction: { footprintId, actorId, emoji: 'heart', createdAt: value.comment.createdAt }, event: { ...value.event, type: 'ReactionAdded' } });
    await repository.transactions!.removeReaction({ footprintId, actorId, event: { ...value.event, type: 'ReactionRemoved' } });
    await repository.transactions!.addComment({ comment: value.comment, event: value.event });
    await repository.transactions!.deleteComment({ commentId: value.comment.id, at: value.comment.createdAt, event: { ...value.event, type: 'CommentDeleted' } });
    expect((query.mock.calls as unknown as Array<[string]>).map(([sql]) => String(sql))).toEqual([
      expect.stringContaining('INSERT INTO footprint_reactions'), expect.stringContaining('INSERT INTO platform.outbox_events'),
      expect.stringContaining('DELETE FROM footprint_reactions'), expect.stringContaining('INSERT INTO platform.outbox_events'),
      expect.stringContaining('INSERT INTO footprint_comments'), expect.stringContaining('INSERT INTO platform.outbox_events'),
      expect.stringContaining('UPDATE footprint_comments'), expect.stringContaining('INSERT INTO platform.outbox_events'),
    ]);
  });

  it('loads the committed reaction winner without another reaction or Outbox mutation', async () => {
    const value = input();
    const winner = { footprintId, actorId, emoji: 'heart', createdAt: value.comment.createdAt };
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ request_hash: 'fingerprint', response: winner }], rowCount: 1 });
    const repository = createPostgresInteractionRepository(database(query));
    await expect(repository.transactions!.addReaction({ reaction: winner, event: { ...value.event, type: 'ReactionAdded' }, idempotency: { actorId, scope: 'interaction.reaction', key: 'same-key', fingerprint: 'fingerprint' } })).resolves.toMatchObject({ emoji: 'heart' });
    expect(query).toHaveBeenCalledTimes(2);
  });
});
