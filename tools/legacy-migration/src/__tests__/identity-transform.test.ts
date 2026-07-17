import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FixtureSource } from '../adapters/fixture-source.js';
import { transformIdentity } from '../domain/identity.js';

describe('legacy identity transformation', () => {
  it('preserves usernames and bcrypt hashes while mapping V2 roles', async () => {
    const source = await (await FixtureSource.fromFile(resolve('fixtures/v1-complete.json'))).collections();
    const result = transformIdentity(source.User);
    expect(result.users[0]).toMatchObject({
      id: '013a7092-e8d8-7d55-9fd5-a6ce0697160b',
      username: 'legacy_user',
      displayName: 'legacy_user',
    });
    expect(result.credentials[0]?.passwordHash).toMatch(/^\$2b\$/);
    const admin = result.users.find((user) => user.username === 'legacy_admin')!;
    expect(result.roles.filter((role) => role.userId === admin.id).map((role) => role.role).sort())
      .toEqual(['admin', 'user']);
    expect(result.adminRoles).toContainEqual(expect.objectContaining({ userId: admin.id, role: 'admin' }));
    expect(JSON.stringify(result)).not.toContain('avatarUrl');
  });
});
