import { describe, expect, it } from 'vitest';

import { canonicalDigest, tableDigest } from '../domain/digests.js';

describe('migration canonical digests', () => {
  it('ignores object key and source row order while preserving values', () => {
    expect(canonicalDigest({ b: 2, a: new Date('2026-01-01T00:00:00.000Z') }))
      .toBe(canonicalDigest({ a: '2026-01-01T00:00:00.000Z', b: 2 }));
    expect(tableDigest([{ id: '2', value: 'b' }, { id: '1', value: 'a' }]))
      .toBe(tableDigest([{ value: 'a', id: '1' }, { id: '2', value: 'b' }]));
  });
});
