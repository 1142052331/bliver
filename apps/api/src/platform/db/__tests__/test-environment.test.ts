import { describe, expect, it } from 'vitest';

import { resolvePostgisDatabaseUrl } from '../test-environment.js';

describe('PostGIS test environment', () => {
  it('uses an explicitly configured database before container discovery', () => {
    const previous = process.env.V2_DATABASE_URL;
    process.env.V2_DATABASE_URL = 'postgresql://example.test/db';

    try {
      expect(resolvePostgisDatabaseUrl()).toBe('postgresql://example.test/db');
    } finally {
      if (previous === undefined) delete process.env.V2_DATABASE_URL;
      else process.env.V2_DATABASE_URL = previous;
    }
  });
});
