import argon2 from 'argon2';
import bcrypt from 'bcryptjs';

export interface PasswordPolicy {
  readonly memoryCost: number;
  readonly timeCost: number;
  readonly parallelism: number;
}

export const defaultPasswordPolicy: PasswordPolicy = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(
  password: string,
  policy: PasswordPolicy = defaultPasswordPolicy,
): Promise<string> {
  if (password.length < 8) throw new Error('PASSWORD_TOO_SHORT');
  return hashArgon2id(password, policy);
}

function hashArgon2id(password: string, policy: PasswordPolicy): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: policy.memoryCost,
    timeCost: policy.timeCost,
    parallelism: policy.parallelism,
  });
}

export function hashVerifiedLegacyPassword(
  password: string,
  policy: PasswordPolicy = defaultPasswordPolicy,
): Promise<string> {
  return hashArgon2id(password, policy);
}

export interface PasswordVerification {
  readonly valid: boolean;
  readonly needsRehash: boolean;
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<PasswordVerification> {
  try {
    if (hash.startsWith('$argon2id$')) {
      return { valid: await argon2.verify(hash, password, { type: argon2.argon2id }), needsRehash: false };
    }
    const bcryptHeader = /^\$2[aby]\$(\d{2})\$/.exec(hash);
    if (!bcryptHeader) return { valid: false, needsRehash: false };
    const cost = Number(bcryptHeader[1]);
    if (cost < 8 || cost > 14) return { valid: false, needsRehash: false };
    const valid = await bcrypt.compare(password, hash);
    return { valid, needsRehash: valid };
  } catch {
    return { valid: false, needsRehash: false };
  }
}
