import { describe, expect, it } from 'vitest';

import {
  resolveFootprintMood,
  serializeFootprintMood,
} from '../footprint-mood.js';

describe('footprint mood catalog', () => {
  it('normalizes stable and legacy mood values to one presentation key', () => {
    expect(serializeFootprintMood(' CALM ')).toBe('calm');
    expect(serializeFootprintMood('happy')).toBe('radiant');
    expect(serializeFootprintMood('\u{1f60a}')).toBe('radiant');
  });

  it('degrades unknown values to the neutral presentation', () => {
    expect(resolveFootprintMood('unknown-server-value')).toBeUndefined();
    expect(serializeFootprintMood(null)).toBeUndefined();
  });
});
