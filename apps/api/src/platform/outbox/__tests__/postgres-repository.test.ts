import { describe, expect, it, vi } from 'vitest';

import type { DatabaseClient } from '../../db/client.js';
import { createPostgresOutboxRepository } from '../postgres-repository.js';

describe('Postgres outbox repository', () => {
  it('claims with row locking and marks processed or failed events', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'event-1', type: 'FootprintPublished', aggregate_id: 'footprint-1', payload: { ok: true }, attempts: 1, claimed_at: 1_700_000_000_000, available_at: 1_700_000_000_000 }] })
      .mockResolvedValue({ rows: [], rowCount: 1 });
    const repository = createPostgresOutboxRepository({ query } as unknown as DatabaseClient, { claimLeaseMs: 30_000 });

    await expect(repository.claim(1_700_000_000_000)).resolves.toMatchObject({ id: 'event-1', attempts: 1, claimedAt: 1_700_000_000_000 });
    await repository.markProcessed('event-1', 1_700_000_000_000, 1_700_000_001_000);
    await repository.markFailed('event-2', 1_700_000_000_000, 'provider down', 1_700_000_002_000, 1_700_000_003_000);

    const [claimSql, claimValues] = query.mock.calls[0] as [string, unknown[]];
    expect(claimSql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(claimSql).toMatch(/processed_at IS NULL/);
    expect(claimSql).toMatch(/claimed_at IS NULL OR claimed_at <= \$2/);
    expect(claimValues).toEqual([new Date(1_700_000_000_000), new Date(1_699_999_970_000)]);
    expect(query.mock.calls[1]).toEqual([
      'UPDATE platform.outbox_events SET processed_at = $3, claimed_at = NULL WHERE id = $1 AND claimed_at = $2 AND processed_at IS NULL',
      ['event-1', new Date(1_700_000_000_000), new Date(1_700_000_001_000)],
    ]);
    expect(query.mock.calls[2]).toEqual([
      'UPDATE platform.outbox_events SET claimed_at = NULL, last_error = $3, available_at = $4, dead_lettered_at = $5 WHERE id = $1 AND claimed_at = $2 AND processed_at IS NULL',
      ['event-2', new Date(1_700_000_000_000), 'provider down', new Date(1_700_000_002_000), new Date(1_700_000_003_000)],
    ]);
  });
});
