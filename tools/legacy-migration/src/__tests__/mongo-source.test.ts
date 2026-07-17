import { describe, expect, it, vi } from 'vitest';

import { createMongoSource } from '../adapters/mongo-source.js';

describe('explicit read-only Mongo source', () => {
  it('uses the explicit database and never falls back to the URI default', async () => {
    const db = { listCollections: vi.fn(async () => [{ name: 'users' }]), collection: vi.fn(() => ({ countDocuments: vi.fn(async () => 2), indexes: vi.fn(async () => []) })) };
    const client = { db: vi.fn(() => db), close: vi.fn(async () => undefined) };
    const source = await createMongoSource('mongodb://source.invalid/default', 'bliver_v1', async () => client);
    expect(client.db).toHaveBeenCalledWith('bliver_v1');
    expect(await source.inventory()).toEqual([{ name: 'users', count: 2, indexes: [] }]);
    await source.close();
  });

  it('rejects an absent explicit database before opening a client', async () => {
    const factory = vi.fn();
    await expect(createMongoSource('mongodb://source.invalid/default', '', factory)).rejects.toThrow('MONGO_DATABASE_REQUIRED');
    expect(factory).not.toHaveBeenCalled();
  });
});
