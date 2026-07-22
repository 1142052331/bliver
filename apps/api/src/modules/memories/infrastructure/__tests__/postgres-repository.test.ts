import { describe, expect, it, vi } from 'vitest';

import type { DatabaseClient } from '../../../../platform/db/client.js';
import { createPostgresMemoryRepository } from '../postgres-repository.js';

describe('Postgres memory repository', () => {
  it('selects and projects footprint mood for map and timeline memories', async () => {
    const query = vi.fn(async () => ({
      rows: [{
        id: '019f0000-0000-7000-8000-000000000001',
        author_id: '019f0000-0000-7000-8000-000000000002',
        author_name: 'Lin',
        display_lat: 31,
        display_lng: 121,
        visibility: 'public',
        location_precision: 'approximate',
        message: 'Evening walk',
        mood: 'quiet',
        published_at: new Date('2026-07-15T08:00:00.000Z'),
        discovery_expires_at: null,
        moderation_hidden_at: null,
      }],
      rowCount: 1,
    }));
    const repository = createPostgresMemoryRepository(
      { query } as unknown as DatabaseClient,
    );

    const [record] = await repository.listByOwner(
      '019f0000-0000-7000-8000-000000000002' as never,
    );
    const [sql] = query.mock.calls[0] as unknown as [string];

    expect(record).toMatchObject({ mood: 'quiet' });
    expect(sql).toContain('f.mood');
  });
});
