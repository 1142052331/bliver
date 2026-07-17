import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { hashPassword, hashVerifiedLegacyPassword, verifyPassword } from '../password.js';

describe('identity password policy', () => {
  it('hashes with Argon2id and never verifies a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'correct horse battery staple')).toEqual({ valid: true, needsRehash: false });
    expect(await verifyPassword(hash, 'wrong')).toEqual({ valid: false, needsRehash: false });
  });

  it('rejects passwords shorter than eight characters', async () => {
    await expect(hashPassword('short')).rejects.toThrow('PASSWORD_TOO_SHORT');
  });

  it('recognizes bounded bcrypt hashes and rehashes verified short legacy passwords', async () => {
    const legacy = await bcrypt.hash('short', 10);
    expect(await verifyPassword(legacy, 'short')).toEqual({ valid: true, needsRehash: true });
    expect(await verifyPassword(legacy, 'wrong')).toEqual({ valid: false, needsRehash: false });
    expect(await hashVerifiedLegacyPassword('short')).toMatch(/^\$argon2id\$/);
  });

  it('rejects bcrypt costs outside the approved range', async () => {
    const weak = await bcrypt.hash('password-123', 4);
    expect(await verifyPassword(weak, 'password-123')).toEqual({ valid: false, needsRehash: false });
  });
});
