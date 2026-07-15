import { describe, expect, it, vi } from 'vitest';

import type { DatabaseClient } from '../../../../platform/db/client.js';
import { createPostgresFootprintRepositories } from '../postgres-repositories.js';

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
    expect(sql).toMatch(/f\.published_at < \$5 OR \(f\.published_at = \$5 AND f\.id < \$6\)/);
    expect(sql).toMatch(/LIMIT \$7/);
    expect(values).toEqual([120, 30, 122, 32, new Date('2026-07-15T08:00:00.000Z'), '019c2f52-3e9b-7d1f-8d68-cf35d75d9b70', 3]);
  });
});
