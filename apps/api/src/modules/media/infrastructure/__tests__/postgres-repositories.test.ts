import { describe, expect, it, vi } from 'vitest';

import type { DatabaseClient } from '../../../../platform/db/client.js';
import { createPostgresMediaRepositories } from '../postgres-repositories.js';

describe('Postgres media repositories', () => {
  it('updates the completed Cloudinary metadata using stable asset identity', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
    const db = { query } as unknown as DatabaseClient;
    const repositories = createPostgresMediaRepositories(db);

    await repositories.assets.updateMetadata('asset-1', { version: 42, width: 1200, height: 900, format: 'jpg' });

    expect(query).toHaveBeenCalledWith(
      'UPDATE media_assets SET version = $2, width = $3, height = $4, format = $5 WHERE id = $1',
      ['asset-1', 42, 1200, 900, 'jpg'],
    );
  });
});
