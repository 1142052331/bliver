import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createConfig, loadApiConfig } from '../config.js';

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

  it('loads the local environment file while preserving runtime overrides', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bliver-api-config-'));
    const environmentFile = join(directory, '.env.v2');
    writeFileSync(environmentFile, [
      'DATABASE_URL=postgresql://file:file@localhost:5432/file',
      'SESSION_SECRET=local-session-secret-that-is-long-enough',
      'PORT=5100',
    ].join('\n'));

    try {
      const config = loadApiConfig({
        ENV_FILE: environmentFile,
        PORT: '5200',
      });
      expect(config.databaseUrl).toBe('postgresql://file:file@localhost:5432/file');
      expect(config.port).toBe(5200);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
