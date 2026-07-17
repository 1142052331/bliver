import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FixtureSource } from '../adapters/fixture-source.js';

const expectedModels = [
  'AdminBootstrap', 'Announcement', 'AuditLog', 'BackfillDiscoveryWindow', 'Block',
  'Conversation', 'Feedback', 'Footprint', 'FootprintRead', 'Friendship', 'Message',
  'Notification', 'PushSubscription', 'Report', 'User',
];

describe('complete V1 fixture source', () => {
  it('loads all 15 model collections and 31 source records', async () => {
    const source = await FixtureSource.fromFile(resolve('fixtures/v1-complete.json'));
    const collections = await source.collections();
    expect(Object.keys(collections).sort()).toEqual(expectedModels.sort());
    expect(Object.values(collections).reduce((sum, rows) => sum + rows.length, 0)).toBe(31);
  });
});
