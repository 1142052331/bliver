import { describe, expect, it } from 'vitest';

import { resources } from '../resources.js';

function leafEntries(value: unknown, prefix = ''): Array<[string, unknown]> {
  if (!value || typeof value !== 'object') return [[prefix, value]];

  return Object.entries(value).flatMap(([key, child]) =>
    leafEntries(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('foundation translation resources', () => {
  it('has the same nonempty keys in every locale', () => {
    const english = leafEntries(resources.en.translation)
      .map(([key]) => key)
      .sort();

    for (const locale of Object.values(resources)) {
      const entries = leafEntries(locale.translation);
      expect(entries.map(([key]) => key).sort()).toEqual(english);

      for (const [, value] of entries) {
        expect(typeof value).toBe('string');
        expect(String(value).trim()).not.toBe('');
      }
    }
  });
});
