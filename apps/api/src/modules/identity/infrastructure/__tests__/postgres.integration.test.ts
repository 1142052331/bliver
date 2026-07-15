import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, closeDb, type DatabaseClient } from '../../../../platform/db/client.js';
import { migrateDatabase } from '../../../../platform/db/migrate.js';
import { resolvePostgisDatabaseUrl } from '../../../../platform/db/test-environment.js';
import { createPostgresIdentityRepositories } from '../postgres-repositories.js';
import { hashPassword } from '../../domain/password.js';
import { createUserId } from '@bliver/domain';

const databaseUrl = resolvePostgisDatabaseUrl();
describe.skipIf(!databaseUrl)('identity PostgreSQL persistence', () => {
  let db: DatabaseClient;
  beforeAll(async () => { await migrateDatabase(databaseUrl as string); db = createDb(databaseUrl as string); });
  afterAll(async () => { await closeDb(); });
  it('persists users and credentials while enforcing unique usernames', async () => {
    const repos = createPostgresIdentityRepositories(db);
    const id = createUserId();
    const username = `int_${Date.now().toString(36)}`;
    await repos.users.create({ id, username, email: null, displayName: 'Integration' });
    await repos.credentials.create({ userId: id, passwordHash: await hashPassword('password-123') });
    expect((await repos.users.findByUsername(username))?.id).toBe(id);
    await expect(repos.users.create({ id: createUserId(), username, email: null, displayName: 'Duplicate' })).rejects.toThrow();
  });
});
