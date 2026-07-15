import { describe, expect, it, vi } from 'vitest';
import { createEventId, createFootprintId, createUserId } from '@bliver/domain';

import type { DatabaseClient } from '../../../../platform/db/client.js';
import { createPostgresFootprintRepositories } from '../postgres-repositories.js';

const actorId = createUserId();
const footprint = {
  id: createFootprintId(),
  authorId: actorId,
  privatePoint: { lat: 31.23, lng: 121.47 },
  displayPoint: { lat: 31.23, lng: 121.47 },
  visibility: 'public' as const,
  locationPrecision: 'precise' as const,
  message: 'Concurrent publish',
  mediaAssetIds: [],
  metadata: { placeId: null, regionId: null, weather: null },
  publishedAt: new Date('2026-07-15T00:00:00.000Z'),
  discoveryExpiresAt: new Date('2026-07-16T00:00:00.000Z'),
};
const input = {
  actorId,
  idempotencyKey: 'publish-1',
  fingerprint: 'same-request',
  footprint,
  outbox: { id: createEventId(), type: 'FootprintPublished' as const, aggregateId: footprint.id, payload: { footprintId: footprint.id, authorId: actorId } },
};

describe('Postgres footprint publish transaction', () => {
  it('returns the concurrent winner after an idempotency reservation race', async () => {
    const winner = { footprint: { ...footprint, id: createFootprintId(), publishedAt: footprint.publishedAt.toISOString(), discoveryExpiresAt: footprint.discoveryExpiresAt.toISOString() }, outbox: { ...input.outbox, id: createEventId() } };
    const query = vi.fn(async (sql: string) => sql.startsWith('INSERT INTO platform.idempotency_keys')
      ? { rows: [], rowCount: 0 }
      : { rows: [{ request_hash: input.fingerprint, response: winner }], rowCount: 1 });
    const db = { query, transaction: async <T>(callback: (client: { query: typeof query }) => Promise<T>) => callback({ query }) } as unknown as DatabaseClient;
    const repositories = createPostgresFootprintRepositories(db);

    const result = await repositories.transactions?.commitPublish(input);
    expect(result?.footprint.id).toBe(winner.footprint.id);
    expect(result?.footprint.publishedAt).toEqual(footprint.publishedAt);
    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[0]?.[0])).toMatch(/ON CONFLICT .* DO NOTHING/);
  });

  it('rejects a concurrent idempotency winner with a different fingerprint', async () => {
    const query = vi.fn(async (sql: string) => sql.startsWith('INSERT INTO platform.idempotency_keys')
      ? { rows: [], rowCount: 0 }
      : { rows: [{ request_hash: 'different-request', response: { footprint, outbox: input.outbox } }], rowCount: 1 });
    const db = { query, transaction: async <T>(callback: (client: { query: typeof query }) => Promise<T>) => callback({ query }) } as unknown as DatabaseClient;
    const repositories = createPostgresFootprintRepositories(db);

    await expect(repositories.transactions?.commitPublish(input)).rejects.toMatchObject({ code: 'FOOTPRINT_CONFLICT' });
  });
});
