import { describe, expect, it } from 'vitest';

import {
  captureDatabaseFingerprint,
  compareDatabaseParity,
  enforceDatabaseBaselineScope,
  toExpectedDatabaseBaseline,
  type DatabaseFingerprint,
  type ExpectedDatabaseBaseline,
} from './database-parity.js';

const baseline: ExpectedDatabaseBaseline = {
  schemaVersion: 1,
  scope: 'LOCAL_REFERENCE',
  server: { major: 16, minor: 14 },
  extensions: [
    { name: 'pgcrypto', version: '1.3' },
    { name: 'postgis', version: '3.6.2' },
  ],
  settings: {
    encoding: 'UTF8',
    collation: 'Chinese (Simplified)_China.936',
    ctype: 'Chinese (Simplified)_China.936',
    timezone: 'Asia/Shanghai',
  },
  migration: {
    tablePresent: true,
    count: 10,
    hashChainSha256: 'migration-hash',
    latestHash: 'latest-hash',
  },
  marker: 'v2-foundation',
  schemaTablesSha256: 'tables-hash',
  indexDefinitionsSha256: 'indexes-hash',
  criticalIndexes: {
    discovery_entries_public_idx: false,
    discovery_entries_region_idx: true,
    footprints_display_point_gist_idx: true,
    outbox_events_ready_idx: true,
    places_location_gist_idx: false,
  },
};

const { scope: _scope, ...fingerprintBaseline } = baseline;
const fingerprint: DatabaseFingerprint = {
  ...fingerprintBaseline,
  capturedAt: '2026-07-17T00:00:00.000Z',
};

describe('database parity comparison', () => {
  it('passes an exact fingerprint while ignoring capture time', () => {
    expect(compareDatabaseParity(fingerprint, baseline)).toEqual({ ok: true, mismatches: [] });
  });

  it('marks a generated baseline with an explicit non-production scope', () => {
    expect(toExpectedDatabaseBaseline(fingerprint, 'LOCAL_REFERENCE')).toMatchObject({
      scope: 'LOCAL_REFERENCE',
      server: fingerprint.server,
    });
    expect(toExpectedDatabaseBaseline(fingerprint, 'LOCAL_REFERENCE')).not.toHaveProperty('capturedAt');
  });

  it('reports safe, field-level mismatches without exposing connection details', () => {
    const actual: DatabaseFingerprint = {
      ...fingerprint,
      server: { major: 15, minor: 8 },
      extensions: [{ name: 'postgis', version: '3.4.0' }],
      criticalIndexes: { ...baseline.criticalIndexes, outbox_events_ready_idx: false },
    };

    const result = compareDatabaseParity(actual, baseline);

    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual(expect.arrayContaining([
      'server.major: expected 16, received 15',
      'server.minor: expected 14, received 8',
      'extensions: expected [{"name":"pgcrypto","version":"1.3"},{"name":"postgis","version":"3.6.2"}], received [{"name":"postgis","version":"3.4.0"}]',
      'criticalIndexes.outbox_events_ready_idx: expected true, received false',
    ]));
    expect(JSON.stringify(result)).not.toMatch(/postgresql:\/\//);
  });

  it('blocks a local reference when deployment requires production equivalence', () => {
    expect(enforceDatabaseBaselineScope({ ok: true, mismatches: [] }, 'LOCAL_REFERENCE', true)).toEqual({
      ok: false,
      mismatches: ['scope: expected "PRODUCTION_EQUIVALENT", received "LOCAL_REFERENCE"'],
    });
  });

  it('captures only safe metadata and tolerates an un-migrated target', async () => {
    const statements: string[] = [];
    const database = {
      async query<T extends Record<string, unknown>>(statement: string) {
        statements.push(statement);
        if (statement.includes("current_setting('server_version_num')")) {
          return { rows: [{ server_version_num: '160014', server_encoding: 'UTF8', lc_collate: 'C', lc_ctype: 'C', timezone: 'UTC' }] as unknown as T[] };
        }
        if (statement.includes('from pg_extension')) {
          return { rows: [{ name: 'pgcrypto', version: '1.3' }, { name: 'postgis', version: '3.6.2' }] as unknown as T[] };
        }
        if (statement.includes('drizzle.__drizzle_migrations')) {
          const error = Object.assign(new Error('missing migration table'), { code: '42P01' });
          throw error;
        }
        if (statement.includes('platform.system_markers')) return { rows: [] as unknown as T[] };
        if (statement.includes('from pg_tables')) return { rows: [{ schemaname: 'platform', tablename: 'system_markers' }] as unknown as T[] };
        return { rows: [{ schemaname: 'platform', indexname: 'outbox_events_ready_idx', indexdef: 'create index ...' }] as unknown as T[] };
      },
    };

    const actual = await captureDatabaseFingerprint(database, '2026-07-17T00:00:00.000Z');

    expect(actual.server).toEqual({ major: 16, minor: 14 });
    expect(actual.migration).toMatchObject({ tablePresent: false, count: 0, latestHash: null });
    expect(actual.marker).toBeNull();
    expect(actual.criticalIndexes.outbox_events_ready_idx).toBe(true);
    expect(JSON.stringify(actual)).not.toMatch(/password|postgresql:\/\//i);
    expect(statements).toHaveLength(6);
    expect(statements[0]).toContain('from pg_database');
    expect(statements[0]).not.toContain("current_setting('lc_collate')");
  });
});
