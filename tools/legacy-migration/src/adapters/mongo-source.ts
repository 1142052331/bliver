import { MongoClient } from 'mongodb';

import { MigrationError } from '../domain/types.js';

interface MongoCollection {
  countDocuments(): Promise<number>;
  indexes(): Promise<readonly unknown[]>;
}
interface MongoDatabase {
  listCollections(options: { readonly nameOnly: true }): Promise<readonly { name: string }[]> | { toArray(): Promise<readonly { name: string }[]> };
  collection(name: string): MongoCollection;
}
interface MongoClientLike { db(name: string): MongoDatabase; close(): Promise<void> }
type ClientFactory = (url: string) => Promise<MongoClientLike>;

export interface MongoInventoryItem { readonly name: string; readonly count: number; readonly indexes: readonly unknown[] }
export interface MongoSource {
  inventory(): Promise<readonly MongoInventoryItem[]>;
  close(): Promise<void>;
}

export async function createMongoSource(url: string, database: string, factory: ClientFactory = async (value) => MongoClient.connect(value) as unknown as Promise<MongoClientLike>): Promise<MongoSource> {
  if (!database.trim()) throw new MigrationError('MONGO_DATABASE_REQUIRED');
  const client = await factory(url);
  const db = client.db(database);
  return {
    async inventory() {
      const cursor = db.listCollections({ nameOnly: true });
      const listed = await cursor;
      const collections = Array.isArray(listed) ? listed : await (listed as unknown as { toArray(): Promise<readonly { name: string }[]> }).toArray();
      const inventory = await Promise.all(collections.map(async ({ name }) => {
        const collection = db.collection(name);
        return { name, count: await collection.countDocuments(), indexes: await collection.indexes() };
      }));
      return inventory;
    },
    async close() { await client.close(); },
  };
}
