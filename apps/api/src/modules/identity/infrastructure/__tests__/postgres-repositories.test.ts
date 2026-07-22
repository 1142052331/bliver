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

  it('reads public user records in the caller-provided id order', async () => {
    const first = createUserId();
    const second = createUserId();
    const query = vi.fn(async () => ({
      rows: [
        { id: second, username: 'bob', email: 'bob@example.com', display_name: 'Bob', created_at: '2026-07-22T00:00:00.000Z' },
        { id: first, username: 'alice', email: 'alice@example.com', display_name: 'Alice', created_at: '2026-07-21T00:00:00.000Z' },
      ],
      rowCount: 2,
    }));
    const db = { orm: {} as never, query, transaction: vi.fn() } as unknown as DatabaseClient;

    const users = await createPostgresIdentityRepositories(db).users.findByIds([second, first]);

    expect(query).toHaveBeenCalledWith(
      'SELECT id, username, email, display_name, created_at FROM identity_users WHERE id = ANY($1::uuid[]) ORDER BY array_position($1::uuid[], id)',
      [[second, first]],
    );
    expect(users.map((user) => user.id)).toEqual([second, first]);
  });
});
