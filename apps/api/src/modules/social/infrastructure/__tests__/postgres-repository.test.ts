import { createEventId, createUserId } from '@bliver/domain';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseClient, DatabaseQueryPort } from '../../../../platform/db/client.js';
import type { FriendshipRecord, FriendshipWriteInput } from '../../application/ports.js';
import { createPostgresSocialRepository } from '../postgres-repository.js';

const requesterId = createUserId();
const addresseeId = createUserId();
const [userLowId, userHighId] = [requesterId, addresseeId].sort();
const record: FriendshipRecord = {
  id: createEventId(),
  userLowId: userLowId!,
  userHighId: userHighId!,
  requesterId,
  addresseeId,
  status: 'pending',
  createdAt: new Date('2026-07-15T08:00:00.000Z'),
  updatedAt: new Date('2026-07-15T08:00:00.000Z'),
};
const write: FriendshipWriteInput = {
  record,
  history: { id: createEventId(), friendshipId: record.id, fromStatus: null, toStatus: 'pending', actorId: requesterId, occurredAt: record.createdAt },
  event: { id: createEventId(), type: 'FriendshipRequested', aggregateId: record.id, occurredAt: record.createdAt.toISOString(), payload: { friendshipId: record.id } },
};

function database(query: ReturnType<typeof vi.fn>): DatabaseClient {
  const client = { query: query as unknown as DatabaseQueryPort['query'] };
  return { query: client.query, async transaction<T>(callback: (value: DatabaseQueryPort) => Promise<T>) { return callback(client); } } as unknown as DatabaseClient;
}

describe('Postgres social repository', () => {
  it('writes a friendship, history and Outbox event in one transaction', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
    const repository = createPostgresSocialRepository(database(query));

    await expect(repository.writeFriendship(write)).resolves.toEqual(record);

    expect((query.mock.calls as unknown as Array<[string]>).map(([sql]) => String(sql))).toEqual([
      expect.stringContaining('INSERT INTO friendships'),
      expect.stringContaining('INSERT INTO friendship_status_history'),
      expect.stringContaining('INSERT INTO platform.outbox_events'),
    ]);
  });

  it('returns the canonical request winner without duplicate history or Outbox writes', async () => {
    const winner = { ...record, id: createEventId() };
    const row = {
      id: winner.id,
      user_low_id: winner.userLowId,
      user_high_id: winner.userHighId,
      requester_id: winner.requesterId,
      addressee_id: winner.addresseeId,
      status: winner.status,
      created_at: winner.createdAt,
      updated_at: winner.updatedAt,
    };
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [row], rowCount: 1 });
    const repository = createPostgresSocialRepository(database(query));

    await expect(repository.writeFriendship(write)).resolves.toMatchObject({ id: winner.id });
    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[1]?.[0])).toContain('FROM friendships');
  });

  it('uses canonical columns for relationship queries and either block direction', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ exists: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ exists: true }], rowCount: 1 });
    const repository = createPostgresSocialRepository(database(query));

    await expect(repository.areFriends(requesterId, addresseeId)).resolves.toBe(true);
    await expect(repository.isBlocked(requesterId, addresseeId)).resolves.toBe(true);

    const statements = query.mock.calls.map(([sql]) => String(sql));
    expect(statements[0]).toContain('user_low_id');
    expect(statements[0]).toContain('user_high_id');
    expect(statements[1]).toContain('blocks');
    expect(statements[1]).toContain('blocker_id');
    expect(statements[1]).toContain('blocked_id');
  });

  it('does not emit a second UserBlocked event after losing the block uniqueness race', async () => {
    const winnerAt = new Date('2026-07-15T07:00:00.000Z');
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ blocker_id: requesterId, blocked_id: addresseeId, created_at: winnerAt }], rowCount: 1 });
    const repository = createPostgresSocialRepository(database(query));

    const result = await repository.writeBlock({
      record: { blockerId: requesterId, blockedId: addresseeId, createdAt: record.createdAt },
      event: { id: createEventId(), type: 'UserBlocked', aggregateId: `${requesterId}:${addresseeId}`, occurredAt: record.createdAt.toISOString(), payload: {} },
    });

    expect(result.createdAt).toEqual(winnerAt);
    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[1]?.[0])).toContain('FROM blocks');
  });
});
