import argon2 from 'argon2';

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
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: policy.memoryCost,
    timeCost: policy.timeCost,
    parallelism: policy.parallelism,
  });
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password, { type: argon2.argon2id });
  } catch {
    return false;
  }
}
