import { createHash, randomBytes } from 'node:crypto';

export type SessionTransport = 'cookie' | 'bearer';
export type SessionPlatform = 'web' | 'capacitor';

export interface SessionPolicy {
  readonly accessTtlMs: number;
  readonly refreshTtlMs: number;
}

export const webSessionPolicy: SessionPolicy = {
  accessTtlMs: 30 * 24 * 60 * 60 * 1000,
  refreshTtlMs: 0,
};

export const capacitorSessionPolicy: SessionPolicy = {
  accessTtlMs: 15 * 60 * 1000,
  refreshTtlMs: 30 * 24 * 60 * 60 * 1000,
};

export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export function normalizeDeviceName(value: string | undefined, platform: SessionPlatform): string {
  const name = value?.trim().replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 64);
  return name || (platform === 'web' ? 'Web browser' : 'Mobile device');
}
