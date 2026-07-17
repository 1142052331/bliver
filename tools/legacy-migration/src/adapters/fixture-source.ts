import { readFile } from 'node:fs/promises';

export const legacyModels = [
  'AdminBootstrap', 'Announcement', 'AuditLog', 'BackfillDiscoveryWindow', 'Block',
  'Conversation', 'Feedback', 'Footprint', 'FootprintRead', 'Friendship', 'Message',
  'Notification', 'PushSubscription', 'Report', 'User',
] as const;

export type LegacyModel = (typeof legacyModels)[number];
export type LegacyRecord = Record<string, unknown>;
export type LegacyCollections = { [K in LegacyModel]: LegacyRecord[] };

export class FixtureSource {
  private constructor(private readonly records: LegacyCollections) {}

  static async fromFile(path: string): Promise<FixtureSource> {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    const records = Object.fromEntries(legacyModels.map((model) => {
      const rows = parsed[model];
      if (!Array.isArray(rows)) throw new Error(`FIXTURE_COLLECTION_MISSING:${model}`);
      return [model, rows];
    })) as LegacyCollections;
    return new FixtureSource(records);
  }

  static fromCollections(records: LegacyCollections): FixtureSource {
    return new FixtureSource(records);
  }

  async collections(): Promise<LegacyCollections> {
    return this.records;
  }
}
