import { describe, expect, it } from 'vitest';

import { createConfig } from '../config.js';

describe('production release identity', () => {
  const base = {
    NODE_ENV: 'production',
    DEPLOY_ENV: 'production',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    SESSION_SECRET: 'production-session-secret-that-is-long-enough',
  } as const;

  it('requires an exact 40-character Git SHA in production', () => {
    expect(() => createConfig({ ...base, RELEASE_SHA: 'candidate' })).toThrow();
    expect(createConfig({ ...base, RELEASE_SHA: 'a'.repeat(40) }).releaseSha).toBe('a'.repeat(40));
  });
});
