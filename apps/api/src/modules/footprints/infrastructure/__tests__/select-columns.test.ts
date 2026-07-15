import { describe, expect, it } from 'vitest';

import { FOOTPRINT_GENERIC_SELECT_COLUMNS } from '../select-columns.js';

describe('footprint persistence selection boundaries', () => {
  it('excludes private_point from the generic select list', () => {
    expect(FOOTPRINT_GENERIC_SELECT_COLUMNS).not.toContain('private_point');
    expect(FOOTPRINT_GENERIC_SELECT_COLUMNS).toContain('display_point');
  });
});
