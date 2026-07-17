import { describe, expect, it, vi } from 'vitest';
import { createUserId } from '@bliver/domain';

import type { DatabaseClient } from '../../../../platform/db/client.js';
import { createPostgresIdentityRepositories } from '../postgres-repositories.js';

describe('PostgreSQL identity credentials', () => {
  it('replaces a password hash only when the expected hash still matches', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
    const db = { orm: {} as never, query, transaction: vi.fn() } as unknown as DatabaseClient;
    const credentials = createPostgresIdentityRepositories(db).credentials;
    const userId = createUserId();

    await expect(credentials.replaceHash(userId, 'legacy-hash', 'argon-hash')).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(
      'UPDATE identity_credentials SET password_hash = $3, updated_at = now() WHERE user_id = $1 AND password_hash = $2',
      [userId, 'legacy-hash', 'argon-hash'],
    );
  });
});
