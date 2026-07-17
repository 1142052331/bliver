import { describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';

describe('migration configuration', () => {
  it('requires an explicit Mongo database when a source URL is configured', () => {
    expect(loadConfig({ LEGACY_MONGO_URL: 'mongodb://source.invalid', LEGACY_MONGO_DATABASE: '' }))
      .toEqual({ ok: false, code: 'MONGO_DATABASE_REQUIRED' });
  });

  it('returns only secret-presence fingerprints in diagnostics', () => {
    const result = loadConfig({
      LEGACY_MONGO_URL: 'mongodb://user:secret@source.invalid/bliver',
      LEGACY_MONGO_DATABASE: 'bliver',
      TARGET_DATABASE_URL: 'postgresql://user:secret@target.invalid/bliver',
      AGE_RECIPIENTS: 'age1first,age1second',
    });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(result).toMatchObject({
      diagnostics: { mongoConfigured: true, targetConfigured: true, ageRecipientCount: 2 },
    });
  });
});
