import { describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '../../../../platform/db/client.js';
import { createPostgresDiscoveryRepository } from '../postgres-repository.js';
describe('Postgres discovery query plan', () => {
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
});
