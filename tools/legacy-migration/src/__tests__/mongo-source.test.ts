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
import { createMongoCollectionsSource } from '../adapters/mongo-source.js';

describe('Mongo collection source', () => {
  it('reads all fifteen explicit V1 collections without writing', async () => {
    const calls: string[] = [];
    const collections = new Map([
      ['users', [{ _id: 'u1', name: 'alice' }]],
      ['footprints', [{ _id: 'f1', userId: 'u1' }]],
    ]);
    const source = await createMongoCollectionsSource('mongodb://source.invalid', 'test', async () => ({
      db(name: string) {
        expect(name).toBe('test');
        return {
          collection(collectionName: string) {
            calls.push(collectionName);
            return { async find() { return { async toArray() { return collections.get(collectionName) ?? []; } }; } };
          },
        };
      },
      async close() { calls.push('close'); },
    }));
    const records = await source.collections();
    await source.close();
    expect(Object.keys(records)).toHaveLength(15);
    expect(records.User).toEqual([{ _id: 'u1', name: 'alice' }]);
    expect(calls).toContain('users');
    expect(calls).toContain('footprints');
    expect(calls).toContain('close');
    expect(calls.some((call) => /insert|update|delete/i.test(call))).toBe(false);
  });
});
