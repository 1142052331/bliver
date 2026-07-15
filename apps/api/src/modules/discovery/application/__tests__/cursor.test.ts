import { describe, expect, it } from 'vitest';
import { decodeDiscoveryCursor, encodeDiscoveryCursor } from '../cursor.js';

describe('discovery cursors', () => {
  it('round trips a signed UUIDv7/time boundary and rejects tampering', () => {
    const cursor = encodeDiscoveryCursor({ id: '019c0000-0000-7000-8000-000000000001', publishedAt: '2026-07-15T08:00:00.000Z' }, 'test-secret');
    expect(decodeDiscoveryCursor(cursor, 'test-secret')).toEqual({ id: '019c0000-0000-7000-8000-000000000001', publishedAt: '2026-07-15T08:00:00.000Z' });
    expect(decodeDiscoveryCursor(`${cursor}x`, 'test-secret')).toBeNull();
    expect(decodeDiscoveryCursor(cursor, 'wrong-secret')).toBeNull();
  });
  it('rejects oversized opaque values', () => { expect(decodeDiscoveryCursor('x'.repeat(513))).toBeNull(); });
});
