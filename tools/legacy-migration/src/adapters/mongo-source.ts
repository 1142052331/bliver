import { MongoClient } from 'mongodb';

import { legacyModels, type LegacyCollections, type LegacyModel, type LegacyRecord } from './fixture-source.js';
import { MigrationError } from '../domain/types.js';

interface MongoCollection {
  countDocuments(): Promise<number>;
  indexes(): Promise<readonly unknown[]>;
  find?(): { toArray(): Promise<readonly LegacyRecord[]> } | Promise<{ toArray(): Promise<readonly LegacyRecord[]> }>;
}
interface MongoDatabase {
  listCollections(options: { readonly nameOnly: true }): Promise<readonly { name: string }[]> | { toArray(): Promise<readonly { name: string }[]> };
  collection(name: string): MongoCollection;
}
interface MongoClientLike { db(name: string): MongoDatabase; close(): Promise<void> }
type ClientFactory = (url: string) => Promise<MongoClientLike>;
interface MongoCollectionsDatabase {
  collection(name: string): Pick<MongoCollection, 'find'>;
}
interface MongoCollectionsClientLike { db(name: string): MongoCollectionsDatabase; close(): Promise<void> }
type CollectionsClientFactory = (url: string) => Promise<MongoCollectionsClientLike>;

export interface MongoInventoryItem { readonly name: string; readonly count: number; readonly indexes: readonly unknown[] }
export interface MongoSource {
  inventory(): Promise<readonly MongoInventoryItem[]>;
  close(): Promise<void>;
}

export interface MongoCollectionsSource {
  collections(): Promise<LegacyCollections>;
  close(): Promise<void>;
}

const collectionNames: Readonly<Record<LegacyModel, string>> = {
  AdminBootstrap: 'adminbootstraps',
  Announcement: 'announcements',
  AuditLog: 'auditlogs',
  BackfillDiscoveryWindow: 'backfilldiscoverywindows',
  Block: 'blocks',
  Conversation: 'conversations',
  Feedback: 'feedbacks',
  Footprint: 'footprints',
  FootprintRead: 'footprintreads',
  Friendship: 'friendships',
  Message: 'messages',
  Notification: 'notifications',
  PushSubscription: 'pushsubscriptions',
  Report: 'reports',
  User: 'users',
};

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

export async function createMongoCollectionsSource(
  url: string,
  database: string,
  factory: CollectionsClientFactory = async (value) => MongoClient.connect(value, { readPreference: 'secondaryPreferred' }) as unknown as Promise<MongoCollectionsClientLike>,
): Promise<MongoCollectionsSource> {
  if (!database.trim()) throw new MigrationError('MONGO_DATABASE_REQUIRED');
  const client = await factory(url);
  const db = client.db(database);
  return {
    async collections() {
      const entries = await Promise.all(legacyModels.map(async (model) => {
        const collection = db.collection(collectionNames[model]);
        if (!collection.find) throw new MigrationError('MONGO_COLLECTION_READ_UNAVAILABLE');
        const cursor = await collection.find();
        return [model, [...await cursor.toArray()]] as const;
      }));
      return Object.fromEntries(entries) as LegacyCollections;
    },
    async close() { await client.close(); },
  };
}
