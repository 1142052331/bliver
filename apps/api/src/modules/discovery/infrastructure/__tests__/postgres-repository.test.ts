import { describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '../../../../platform/db/client.js';
import { createPostgresDiscoveryRepository } from '../postgres-repository.js';
describe('Postgres discovery query plan', () => {
  it('can rebuild the projection from canonical footprints at startup', async () => {
    const query = vi.fn(async (...args: [string, (readonly unknown[])?]) => { void args; return { rows: [], rowCount: 0 }; });
    const repository = createPostgresDiscoveryRepository({ query } as unknown as DatabaseClient);

    await repository.backfill();

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('INSERT INTO discovery_entries');
    expect(sql).toContain('FROM footprints f');
    expect(sql).toContain('ON CONFLICT (footprint_id) DO UPDATE');
    expect(sql).toContain('ma.version IS NOT NULL');
  });

  it('pushes privacy through an explicit relationship filter port', async () => {
    const query = vi.fn(async (...args: [string, (readonly unknown[])?]) => { void args; return { rows: [], rowCount: 0 }; });
    const accessFilter = vi.fn(() => 'social_access_policy');
    const repository = createPostgresDiscoveryRepository({ query } as unknown as DatabaseClient, { accessFilter });

    await repository.listCandidates({ scope: 'region', actorId: '019f0000-0000-7000-8000-000000000001', regionId: '019f0000-0000-7000-8000-000000000002', query: 'river', relationship: 'friends', content: 'unread', cursor: { publishedAt: '2026-07-15T08:00:00.000Z', id: '019f0000-0000-7000-8000-000000000003' }, limit: 25 });

    const sql = String(query.mock.calls[0]?.[0]);
    expect(accessFilter).toHaveBeenCalledWith(expect.objectContaining({ authorColumn: 'd.author_id', relationship: 'friends' }));
    expect(sql).toContain('social_access_policy');
    expect(sql).not.toContain('user_blocks');
    expect(sql).not.toContain('FROM friendships');
    expect(sql).toContain('discovery_reads');
    expect(sql).toContain('ORDER BY d.published_at DESC, d.footprint_id DESC LIMIT');
    expect(query.mock.calls[0]?.[1]).toHaveLength(6);
  });

  it('hydrates Activity candidates with the first completed media preview', async () => {
    const query = vi.fn(async (...args: [string, (readonly unknown[])?]) => { void args; return { rows: [{
      footprint_id: '019f0000-0000-7000-8000-000000000001',
      author_id: '019f0000-0000-7000-8000-000000000002',
      author_name: 'Lin',
      display_lat: 31,
      display_lng: 121,
      visibility: 'public',
      location_precision: 'approximate',
      mood: 'calm',
      published_at: new Date('2026-07-15T08:00:00.000Z'),
      discovery_expires_at: new Date('2099-07-15T08:00:00.000Z'),
      primary_media_public_id: 'bliver/lin/asset',
      primary_media_version: 9,
      primary_media_width: 1200,
      primary_media_height: 900,
      primary_media_format: 'webp',
    }], rowCount: 1 }; });
    const repository = createPostgresDiscoveryRepository(
      { query } as unknown as DatabaseClient,
      { cloudName: 'demo' },
    );

    const [entry] = await repository.listCandidates({
      scope: 'global',
      actorId: null,
      relationship: 'all',
      content: 'all',
      limit: 1,
    });

    expect(entry?.primaryMedia).toEqual({
      url: 'https://res.cloudinary.com/demo/image/upload/v9/bliver/lin/asset.webp',
      width: 1200,
      height: 900,
    });
    expect(entry?.mood).toBe('calm');
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('LEFT JOIN LATERAL');
    expect(sql).toContain('source_footprint.mood');
    expect(sql).toContain('ORDER BY fm.position ASC');
    expect(sql).not.toContain('api_secret');
  });
});
