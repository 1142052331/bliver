import { describe, expect, it } from 'vitest';
import { createFootprintId, createUserId } from '@bliver/domain';
import { FootprintVisibilityPolicy, type FootprintPolicyInput } from '../../index.js';
import { MapFootprintQuery, createMemoryMapFootprintRepository, type MapBounds } from '../map-query.js';

const owner = createUserId();
const bounds: MapBounds = { west: 120, south: 30, east: 122, north: 32 };
const now = new Date('2026-07-15T08:00:00.000Z');

function record(overrides: Partial<FootprintPolicyInput> = {}): FootprintPolicyInput {
  return { id: createFootprintId(), authorId: owner, author: { name: 'Owner' }, displayPoint: { lat: 31, lng: 121 }, visibility: 'public', locationPrecision: 'precise', publishedAt: new Date('2026-07-15T07:00:00.000Z'), discoveryExpiresAt: new Date('2026-07-15T09:00:00.000Z'), ...overrides };
}

function query(records: FootprintPolicyInput[], maxResults = 50) {
  const repository = createMemoryMapFootprintRepository(records);
  const policy = new FootprintVisibilityPolicy({ records: { async findById(id) { return records.find((item) => item.id === id) ?? null; } }, friendships: { async areAcceptedFriends() { return false; } }, blocks: { async isEitherBlocked() { return false; } }, moderation: { async hasCaseAccess() { return false; } }, now: () => now });
  return new MapFootprintQuery({ repository, policy, maxResults });
}

describe('MapFootprintQuery', () => {
  it('returns active public footprints for guests without private coordinates', async () => {
    const result = await query([record()]).execute({ actor: null, bounds });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty('privatePoint');
  });

  it('uses a stable descending order and opaque cursor pagination', async () => {
    const first = record({ publishedAt: new Date('2026-07-15T07:00:00.000Z') });
    const second = record({ publishedAt: new Date('2026-07-15T06:00:00.000Z') });
    const service = query([first, second], 1);
    const page = await service.execute({ actor: null, bounds });
    expect(page.items[0]?.id).toBe(first.id);
    expect(page.nextCursor).toEqual(expect.any(String));
    const next = await service.execute({ actor: null, bounds, cursor: page.nextCursor as string });
    expect(next.items[0]?.id).toBe(second.id);
  });

  it('enforces a maximum result count and returns empty for an empty viewport', async () => {
    const result = await query(Array.from({ length: 4 }, () => record()), 2).execute({ actor: null, bounds });
    expect(result.items).toHaveLength(2);
    expect(await query([]).execute({ actor: null, bounds })).toEqual({ items: [], nextCursor: null });
  });

  it('rejects an unsigned or tampered cursor before querying', async () => {
    await expect(query([record()]).execute({ actor: null, bounds, cursor: 'eyJpZCI6ImZha2UiLCJwdWJsaXNoZWRBdCI6IjIwMjYtMDctMTVUMDg6MDA6MDAuMDAwWiJ9' })).rejects.toThrow('Invalid cursor');
  });
});
