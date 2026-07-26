import { createFootprintId, createUserId } from '@bliver/domain';
import { describe, expect, it, vi } from 'vitest';

import { FootprintVisibilityPolicy, type FootprintPolicyInput } from '../../../footprints/index.js';
import { AuthorizedMemoryQuery } from '../authorized-query.js';

describe('AuthorizedMemoryQuery timeline', () => {
  it('does not lose footprints that share a publication timestamp across pages', async () => {
    const ownerId = createUserId();
    const publishedAt = new Date('2026-07-25T08:00:00.000Z');
    const records: FootprintPolicyInput[] = Array.from({ length: 51 }, () => ({
      id: createFootprintId(),
      authorId: ownerId,
      author: { name: 'River' },
      displayPoint: { lat: 31, lng: 121 },
      visibility: 'public',
      locationPrecision: 'approximate',
      publishedAt,
      discoveryExpiresAt: null,
    }));
    const source = {
      async listByOwner() { return records; },
      async findById(id: string) { return records.find((record) => record.id === id) ?? null; },
    };
    const policy = new FootprintVisibilityPolicy({
      records: source,
      friendships: { async areAcceptedFriends() { return false; } },
      blocks: { async isEitherBlocked() { return false; } },
      moderation: { async hasCaseAccess() { return false; } },
      now: () => publishedAt,
    });
    const query = new AuthorizedMemoryQuery(source, policy);
    const viewer = { userId: ownerId, sessionId: 'session', roles: ['user'] as const, transport: 'cookie' as const };

    const first = await query.timeline(ownerId, viewer);
    const second = await query.timeline(ownerId, viewer, first.nextCursor as string);

    expect(first.items).toHaveLength(50);
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map(({ id }) => id)).size).toBe(51);
  });

  it('builds overview from one authorized history read', async () => {
    const ownerId = createUserId();
    const visitorId = createUserId();
    const publishedAt = new Date('2026-07-25T08:00:00.000Z');
    const record: FootprintPolicyInput = {
      id: createFootprintId(),
      authorId: ownerId,
      author: { name: 'River' },
      displayPoint: { lat: 31, lng: 121 },
      visibility: 'public',
      locationPrecision: 'approximate',
      publishedAt,
      discoveryExpiresAt: null,
    };
    const listByOwner = vi.fn(async () => [record]);
    const source = {
      listByOwner,
      async findById(id: string) { return id === record.id ? record : null; },
    };
    const policy = new FootprintVisibilityPolicy({
      records: source,
      friendships: { async areAcceptedFriends() { return false; } },
      blocks: { async isEitherBlocked() { return false; } },
      moderation: { async hasCaseAccess() { return false; } },
      now: () => publishedAt,
    });
    const listForFootprints = vi.fn(async () => [{
      assetId: 'asset-1', footprintId: record.id, url: 'https://example.test/photo.jpg', createdAt: publishedAt,
    }]);
    const listVisitors = vi.fn(async () => [{ id: visitorId, name: 'Visitor', visitedAt: publishedAt.toISOString() }]);
    const query = new AuthorizedMemoryQuery(source, policy, { listForFootprints }, {
      list: listVisitors,
      async record() {},
      async isVisible() { return true; },
    });
    const viewer = { userId: ownerId, sessionId: 'session', roles: ['user'] as const, transport: 'cookie' as const };

    await expect(query.overview(ownerId, viewer)).resolves.toEqual({
      map: [expect.objectContaining({ id: record.id })],
      summary: { footprintCount: 1, photoCount: 1, visitorCount: 1 },
    });
    expect(listByOwner).toHaveBeenCalledOnce();
    expect(listForFootprints).toHaveBeenCalledWith([record.id]);
    expect(listVisitors).toHaveBeenCalledOnce();
  });
});
