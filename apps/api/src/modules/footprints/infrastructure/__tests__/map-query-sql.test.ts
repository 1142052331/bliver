import { describe, expect, it, vi } from 'vitest';

import type { DatabaseClient } from '../../../../platform/db/client.js';
import { createPostgresFootprintRepositories } from '../postgres-repositories.js';
import { MapFootprintQuery } from '../../application/map-query.js';
import { FootprintVisibilityPolicy } from '../../domain/visibility-policy.js';

describe('Postgres map query SQL', () => {
  it('pushes cursor and bounded limit into the public viewport query', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const repositories = createPostgresFootprintRepositories({ query } as unknown as DatabaseClient);

    await repositories.listInViewport({
      bounds: { west: 120, south: 30, east: 122, north: 32 },
      limit: 3,
      cursor: { publishedAt: '2026-07-15T08:00:00.000Z', id: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b70' },
    });

    const [sql, values] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/f\.visibility = 'public' AND f\.discovery_expires_at > CURRENT_TIMESTAMP/);
    expect(sql).toMatch(/f\.published_at < \$5 OR \(f\.published_at = \$5 AND f\.id < \$6\)/);
    expect(sql).toMatch(/LIMIT \$7/);
    expect(values).toEqual([120, 30, 122, 32, new Date('2026-07-15T08:00:00.000Z'), '019c2f52-3e9b-7d1f-8d68-cf35d75d9b70', 3]);
  });

  it('pushes Phase 3 owner authorization before cursor and limit', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const repositories = createPostgresFootprintRepositories({ query } as unknown as DatabaseClient);

    await repositories.listInViewport({ bounds: { west: 120, south: 30, east: 122, north: 32 }, viewerId: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b71', limit: 1 });

    const [sql, values] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/f\.author_id = \$5/);
    expect(sql.indexOf('f.author_id = $5')).toBeLessThan(sql.indexOf('LIMIT $6'));
    expect(values).toEqual([120, 30, 122, 32, '019c2f52-3e9b-7d1f-8d68-cf35d75d9b71', 1]);
  });

  it('projects the first completed media asset as a delivery preview', async () => {
    const footprintId = '019c2f52-3e9b-7d1f-8d68-cf35d75d9b70';
    const ownerId = '019c2f52-3e9b-7d1f-8d68-cf35d75d9b71';
    const query = vi.fn(async () => ({ rows: [{
      id: footprintId,
      author_id: ownerId,
      author_name: 'Owner',
      display_lat: 31,
      display_lng: 121,
      visibility: 'public',
      location_precision: 'approximate',
      mood: 'quiet',
      published_at: new Date('2026-07-15T07:00:00.000Z'),
      discovery_expires_at: new Date('2099-07-15T08:00:00.000Z'),
      primary_media_public_id: 'bliver/owner/asset',
      primary_media_version: 42,
      primary_media_width: 1600,
      primary_media_height: 1200,
      primary_media_format: 'jpg',
    }], rowCount: 1 }));
    const repositories = createPostgresFootprintRepositories(
      { query } as unknown as DatabaseClient,
      { cloudName: 'demo' },
    );

    const detail = await repositories.publicDetails?.findById(footprintId as never);

    expect(detail?.primaryMedia).toEqual({
      url: 'https://res.cloudinary.com/demo/image/upload/v42/bliver/owner/asset.jpg',
      width: 1600,
      height: 1200,
    });
    expect(detail?.mood).toBe('quiet');
    const [sql] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('LEFT JOIN LATERAL');
    expect(sql).toContain('ORDER BY fm.position ASC');
    expect(sql).toContain('f.mood');
    expect(sql).toContain('ma.version IS NOT NULL');
    expect(sql).not.toContain('api_secret');
  });

  it('returns the older readable row without a misleading next cursor after SQL privacy filtering', async () => {
    const ownerId = '019c2f52-3e9b-7d1f-8d68-cf35d75d9b71';
    const readableId = '019c2f52-3e9b-7d1f-8d68-cf35d75d9b70';
    const query = vi.fn(async () => ({ rows: [{ id: readableId, author_id: ownerId, author_name: 'Owner', display_lat: 31, display_lng: 121, visibility: 'private', location_precision: 'precise', published_at: new Date('2026-07-15T07:00:00.000Z'), discovery_expires_at: null }], rowCount: 1 }));
    const repositories = createPostgresFootprintRepositories({ query } as unknown as DatabaseClient);
    const policy = new FootprintVisibilityPolicy({ records: repositories, friendships: { async areAcceptedFriends() { return false; } }, blocks: { async isEitherBlocked() { return false; } }, moderation: { async hasCaseAccess() { return false; } }, now: () => new Date('2026-07-15T08:00:00.000Z') });
    const result = await new MapFootprintQuery({ repository: repositories, policy, maxResults: 1 }).execute({ actor: { userId: ownerId, sessionId: 'session-1', roles: ['user'], transport: 'cookie' }, bounds: { west: 120, south: 30, east: 122, north: 32 } });

    expect(result.items.map((item) => item.id)).toEqual([readableId]);
    expect(result.nextCursor).toBeNull();
    const [sql] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/f\.author_id = \$5/);
    expect(sql).toMatch(/LIMIT \$6/);
  });
});
