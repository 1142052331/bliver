import { describe, expect, it, vi } from 'vitest';

import type { DatabaseClient } from '../../../../platform/db/client.js';
import { createPostgresMediaRepositories } from '../postgres-repositories.js';

const signatureInput = {
  actorId: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b71',
  key: 'upload-1',
  fingerprint: 'image/jpeg:10',
  asset: { assetId: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b70', ownerId: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b71', publicId: 'bliver/owner/asset', mimeType: 'image/jpeg' as const, bytes: 10, version: null, width: null, height: null, format: 'jpg', createdAt: new Date('2026-07-15T00:00:00.000Z') },
  result: { assetId: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b70', signature: 'loser', timestamp: 1, apiKey: 'key', cloudName: 'cloud', publicId: 'bliver/owner/asset', version: null, width: null, height: null, format: 'jpg', allowedFormats: 'jpg', maxFileBytes: 10 },
};

describe('Postgres media repositories', () => {
  it('updates the completed Cloudinary metadata using stable asset identity', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
    const db = { query } as unknown as DatabaseClient;
    const repositories = createPostgresMediaRepositories(db);

    await repositories.assets.updateMetadata('asset-1', { version: 42, width: 1200, height: 900, format: 'jpg' });

    expect(query).toHaveBeenCalledWith(
      'UPDATE media_assets SET version = $2, width = $3, height = $4, format = $5 WHERE id = $1',
      ['asset-1', 42, 1200, 900, 'jpg'],
    );
  });

  it('returns the concurrent winner after an idempotency reservation race', async () => {
    const winner = { ...signatureInput.result, assetId: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b72', signature: 'winner' };
    const query = vi.fn(async (sql: string) => sql.startsWith('INSERT INTO platform.idempotency_keys')
      ? { rows: [], rowCount: 0 }
      : { rows: [{ request_hash: signatureInput.fingerprint, response: winner }], rowCount: 1 });
    const db = { query, transaction: async <T>(callback: (client: { query: typeof query }) => Promise<T>) => callback({ query }) } as unknown as DatabaseClient;
    const repositories = createPostgresMediaRepositories(db);

    await expect(repositories.transactions?.commitSignature(signatureInput)).resolves.toEqual(winner);
    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[0]?.[0])).toMatch(/ON CONFLICT .* DO NOTHING/);
  });

  it('rejects a concurrent idempotency winner with a different fingerprint', async () => {
    const query = vi.fn(async (sql: string) => sql.startsWith('INSERT INTO platform.idempotency_keys')
      ? { rows: [], rowCount: 0 }
      : { rows: [{ request_hash: 'image/png:10', response: signatureInput.result }], rowCount: 1 });
    const db = { query, transaction: async <T>(callback: (client: { query: typeof query }) => Promise<T>) => callback({ query }) } as unknown as DatabaseClient;
    const repositories = createPostgresMediaRepositories(db);

    await expect(repositories.transactions?.commitSignature(signatureInput)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  });
});
