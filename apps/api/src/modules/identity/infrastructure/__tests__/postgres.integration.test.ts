import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDb, closeDb, type DatabaseClient } from '../../../../platform/db/client.js';
import { migrateDatabase } from '../../../../platform/db/migrate.js';
import { resolvePostgisDatabaseUrl } from '../../../../platform/db/test-environment.js';
import { createPostgresIdentityRepositories } from '../postgres-repositories.js';
import { hashPassword } from '../../domain/password.js';
import { createUserId, type UserId } from '@bliver/domain';

const databaseUrl = resolvePostgisDatabaseUrl();
describe.skipIf(!databaseUrl)('identity PostgreSQL persistence', () => {
  let db: DatabaseClient;
  const createdIds: UserId[] = [];
  beforeAll(async () => { await migrateDatabase(databaseUrl as string); db = createDb(databaseUrl as string); });
  afterEach(async () => { if (createdIds.length) await db.query('DELETE FROM identity_users WHERE id = ANY($1::uuid[])', [createdIds.splice(0)]); });
  afterAll(async () => { await closeDb(); });
  it('persists users and credentials while enforcing unique usernames', async () => {
    const repos = createPostgresIdentityRepositories(db);
    const id = createUserId();
    createdIds.push(id);
    const username = `int_${Date.now().toString(36)}`;
    await repos.users.create({ id, username, email: null, displayName: 'Integration' });
    await repos.credentials.create({ userId: id, passwordHash: await hashPassword('password-123') });
    const original = (await repos.credentials.findByUserId(id))!.passwordHash;
    const replacement = await hashPassword('replacement-password');
    await expect(repos.credentials.replaceHash(id, 'not-the-current-hash', replacement)).resolves.toBe(false);
    await expect(repos.credentials.replaceHash(id, original, replacement)).resolves.toBe(true);
    expect((await repos.credentials.findByUserId(id))?.passwordHash).toBe(replacement);
    expect((await repos.users.findByUsername(username))?.id).toBe(id);
    expect(await repos.roles.listByUserId(id)).toEqual(['user']);
    await expect(repos.users.create({ id: createUserId(), username, email: null, displayName: 'Duplicate' })).rejects.toThrow();
  });
});
