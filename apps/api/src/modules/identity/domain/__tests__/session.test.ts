import { describe, expect, it } from 'vitest';
import { capacitorSessionPolicy, hashToken, normalizeDeviceName, isExpired } from '../session.js';

describe('identity sessions', () => {
  it('stores only a deterministic sha256 token hash', () => {
    expect(hashToken('secret')).toMatch(/^[a-f0-9]{64}$/);
  });
  it('uses a fifteen minute capacitor access policy and safe device fallback', () => {
    expect(capacitorSessionPolicy.accessTtlMs).toBe(15 * 60 * 1000);
    expect(normalizeDeviceName('', 'capacitor')).toBe('Mobile device');
  });
  it('expires at or after the expiry instant', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(isExpired(now, now)).toBe(true);
  });
});
