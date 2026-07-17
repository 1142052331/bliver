import { describe, expect, it } from 'vitest';

import { canonicalObjectId, legacyUuid } from '../domain/ids.js';

describe('legacy deterministic identifiers', () => {
  it('matches fixed UUIDv5 vectors regardless of ObjectId case', () => {
    expect(legacyUuid('user', '507F1F77BCF86CD799439011'))
      .toBe('1affe023-1ff6-5815-84fe-1479219eac70');
    expect(legacyUuid('footprint', '507f1f77bcf86cd799439012'))
      .toBe('6d3b32ba-ad39-5a10-bba8-b2f5369c6a02');
  });

  it('rejects values that are not canonical Mongo ObjectIds', () => {
    expect(() => canonicalObjectId('not-an-object-id')).toThrow('INVALID_OBJECT_ID');
  });
});
