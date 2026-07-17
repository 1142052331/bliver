import { describe, expect, it } from 'vitest';
import { validate, version } from 'uuid';

import { canonicalObjectId, DeterministicIdRegistry, legacyUuid } from '../domain/ids.js';

describe('legacy deterministic identifiers', () => {
  it('matches fixed deterministic UUIDv7 vectors regardless of ObjectId case', () => {
    expect(legacyUuid('user', '507F1F77BCF86CD799439011'))
      .toBe('013a7092-e8d8-7d55-9fd5-a6ce0697160b');
    expect(legacyUuid('footprint', '507f1f77bcf86cd799439012'))
      .toBe('013a7092-e8d8-7a27-a32c-a48a35763e20');
    expect(version(legacyUuid('user', '507f1f77bcf86cd799439011'))).toBe(7);
  });

  it('uses a stable epoch for derived keys without depending on scan order', () => {
    const first = legacyUuid('region', 'CN:SH');
    const second = legacyUuid('region', ['SH', 'CN'].sort().join(':'));
    expect(first).toBe('019f7285-d000-735c-bc6c-a40033c9742b');
    expect(second).toBe(first);
    expect(validate(first)).toBe(true);
    expect(version(first)).toBe(7);
  });

  it('rejects values that are not canonical Mongo ObjectIds', () => {
    expect(() => canonicalObjectId('not-an-object-id')).toThrow('INVALID_OBJECT_ID');
  });

  it('blocks two distinct canonical sources that collide on a target UUID', () => {
    const forced = '019f7285-d000-7000-8000-000000000001';
    const registry = new DeterministicIdRegistry(() => forced);
    expect(registry.id('user', '507f1f77bcf86cd799439011')).toBe(forced);
    expect(() => registry.id('user', '507f1f77bcf86cd799439012')).toThrow('UUID_COLLISION');
  });
});
