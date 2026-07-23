import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const sql = readFileSync(resolve(apiRoot, 'drizzle/0011_discovery_projection_backfill.sql'), 'utf8');

describe('discovery projection backfill migration', () => {
  it('rebuilds entries from canonical footprints and completed media', () => {
    expect(sql).toContain('INSERT INTO discovery_entries');
    expect(sql).toContain('FROM footprints f');
    expect(sql).toContain('FROM footprint_media fm');
    expect(sql).toContain('ma.version IS NOT NULL');
    expect(sql).toContain('ON CONFLICT (footprint_id) DO UPDATE');
  });
});
