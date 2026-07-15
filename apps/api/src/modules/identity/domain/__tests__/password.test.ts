import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../password.js';

describe('identity password policy', () => {
  it('hashes with Argon2id and never verifies a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('rejects passwords shorter than eight characters', async () => {
    await expect(hashPassword('short')).rejects.toThrow('PASSWORD_TOO_SHORT');
  });
});
