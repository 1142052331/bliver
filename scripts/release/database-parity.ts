import { createHash } from 'node:crypto';

export const criticalDatabaseIndexes = [
  'discovery_entries_public_idx',
  'discovery_entries_region_idx',
  'footprints_display_point_gist_idx',
  'outbox_events_ready_idx',
  'places_location_gist_idx',
] as const;

export interface DatabaseQueryResult<TRow extends Record<string, unknown>> {
  readonly rows: readonly TRow[];
}

export interface DatabaseQueryable {
  query<TRow extends Record<string, unknown>>(
    statement: string,
    values?: readonly unknown[],
  ): Promise<DatabaseQueryResult<TRow>>;
}

export interface DatabaseExtension {
  readonly name: string;
  readonly version: string;
}

export interface DatabaseFingerprint {
  readonly schemaVersion: 1;
  readonly capturedAt: string;
  readonly server: { readonly major: number; readonly minor: number };
  readonly extensions: readonly DatabaseExtension[];
  readonly settings: {
    readonly encoding: string;
    readonly collation: string;
    readonly ctype: string;
    readonly timezone: string;
  };
  readonly migration: {
    readonly tablePresent: boolean;
    readonly count: number;
    readonly hashChainSha256: string;
    readonly latestHash: string | null;
  };
  readonly marker: string | null;
  readonly schemaTablesSha256: string;
  readonly indexDefinitionsSha256: string;
  readonly criticalIndexes: Readonly<Record<(typeof criticalDatabaseIndexes)[number], boolean>>;
}

export type DatabaseBaselineScope = 'LOCAL_REFERENCE' | 'PRODUCTION_EQUIVALENT';

export type ExpectedDatabaseBaseline = Omit<DatabaseFingerprint, 'capturedAt'> & {
  readonly scope: DatabaseBaselineScope;
};

export interface DatabaseParityResult {
  readonly ok: boolean;
  readonly mismatches: readonly string[];
}

interface ServerSettingsRow extends Record<string, unknown> {
  readonly server_version_num: string;
  readonly server_encoding: string;
  readonly lc_collate: string;
  readonly lc_ctype: string;
  readonly timezone: string;
}

interface ExtensionRow extends Record<string, unknown> {
  readonly name: string;
  readonly version: string;
}

interface MigrationRow extends Record<string, unknown> {
  readonly hash: string;
}

interface MarkerRow extends Record<string, unknown> {
  readonly id: string;
}

interface TableRow extends Record<string, unknown> {
  readonly schemaname: string;
  readonly tablename: string;
}

interface IndexRow extends Record<string, unknown> {
  readonly schemaname: string;
  readonly indexname: string;
  readonly indexdef: string;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableDigest(rows: readonly string[]): string {
  return digest([...rows].sort().join('\n'));
}

function mismatch(path: string, expected: unknown, received: unknown): string {
  return `${path}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(received)}`;
}

function isMissingRelation(error: unknown): boolean {
  const code = (error as { readonly code?: string } | undefined)?.code;
  return code === '42P01' || code === '3F000';
}

async function queryOptional<TRow extends Record<string, unknown>>(
  database: DatabaseQueryable,
  statement: string,
): Promise<readonly TRow[] | undefined> {
  try {
    return (await database.query<TRow>(statement)).rows;
  } catch (error: unknown) {
    if (isMissingRelation(error)) return undefined;
    throw error;
  }
}

export async function captureDatabaseFingerprint(
  database: DatabaseQueryable,
  capturedAt: string = new Date().toISOString(),
): Promise<DatabaseFingerprint> {
  const settings = (await database.query<ServerSettingsRow>(`
    select
      current_setting('server_version_num') as server_version_num,
      current_setting('server_encoding') as server_encoding,
      datcollate as lc_collate,
      datctype as lc_ctype,
      current_setting('TimeZone') as timezone
    from pg_database
    where datname = current_database()
  `)).rows[0];
  if (!settings) throw new Error('database settings query returned no rows');

  const serverVersionNumber = Number(settings.server_version_num);
  if (!Number.isInteger(serverVersionNumber) || serverVersionNumber < 100000) {
    throw new Error('database returned an invalid PostgreSQL version number');
  }

  const extensionRows = (await database.query<ExtensionRow>(`
    select extname as name, extversion as version
    from pg_extension
    where extname in ('postgis', 'pgcrypto')
    order by extname
  `)).rows;
  const migrations = await queryOptional<MigrationRow>(database, `
    select hash
    from drizzle.__drizzle_migrations
    order by created_at, id
  `);
  const markers = await queryOptional<MarkerRow>(database, `
    select id
    from platform.system_markers
    where id = 'v2-foundation'
    limit 1
  `);
  const tables = await database.query<TableRow>(`
    select schemaname, tablename
    from pg_tables
    where schemaname in ('public', 'platform')
    order by schemaname, tablename
  `);
  const indexes = await database.query<IndexRow>(`
    select schemaname, indexname, indexdef
    from pg_indexes
    where schemaname in ('public', 'platform')
    order by schemaname, indexname
  `);

  const migrationHashes = (migrations ?? []).map((row) => row.hash);
  const indexRows = indexes.rows.map((row) => `${row.schemaname}.${row.indexname}\0${row.indexdef}`);
  const indexNames = new Set(indexes.rows.map((row) => row.indexname));

  return {
    schemaVersion: 1,
    capturedAt,
    server: {
      major: Math.floor(serverVersionNumber / 10000),
      minor: serverVersionNumber % 10000,
    },
    extensions: extensionRows.map((row) => ({ name: row.name, version: row.version })),
    settings: {
      encoding: settings.server_encoding,
      collation: settings.lc_collate,
      ctype: settings.lc_ctype,
      timezone: settings.timezone,
    },
    migration: {
      tablePresent: migrations !== undefined,
      count: migrationHashes.length,
      hashChainSha256: digest(migrationHashes.join('\n')),
      latestHash: migrationHashes.at(-1) ?? null,
    },
    marker: markers?.[0]?.id ?? null,
    schemaTablesSha256: stableDigest(tables.rows.map((row) => `${row.schemaname}.${row.tablename}`)),
    indexDefinitionsSha256: stableDigest(indexRows),
    criticalIndexes: Object.fromEntries(
      criticalDatabaseIndexes.map((name) => [name, indexNames.has(name)]),
    ) as Readonly<Record<(typeof criticalDatabaseIndexes)[number], boolean>>,
  };
}

export function toExpectedDatabaseBaseline(
  fingerprint: DatabaseFingerprint,
  scope: DatabaseBaselineScope,
): ExpectedDatabaseBaseline {
  const { capturedAt: _capturedAt, ...baseline } = fingerprint;
  return { ...baseline, scope };
}

export function compareDatabaseParity(
  actual: DatabaseFingerprint,
  expected: ExpectedDatabaseBaseline,
): DatabaseParityResult {
  const mismatches: string[] = [];
  const compare = (path: string, received: unknown, expectedValue: unknown) => {
    if (JSON.stringify(received) !== JSON.stringify(expectedValue)) {
      mismatches.push(mismatch(path, expectedValue, received));
    }
  };

  compare('schemaVersion', actual.schemaVersion, expected.schemaVersion);
  compare('server.major', actual.server.major, expected.server.major);
  compare('server.minor', actual.server.minor, expected.server.minor);
  compare('extensions', actual.extensions, expected.extensions);
  compare('settings', actual.settings, expected.settings);
  compare('migration', actual.migration, expected.migration);
  compare('marker', actual.marker, expected.marker);
  compare('schemaTablesSha256', actual.schemaTablesSha256, expected.schemaTablesSha256);
  compare('indexDefinitionsSha256', actual.indexDefinitionsSha256, expected.indexDefinitionsSha256);
  for (const name of criticalDatabaseIndexes) {
    compare(`criticalIndexes.${name}`, actual.criticalIndexes[name], expected.criticalIndexes[name]);
  }

  return { ok: mismatches.length === 0, mismatches };
}

export function enforceDatabaseBaselineScope(
  result: DatabaseParityResult,
  scope: DatabaseBaselineScope,
  requireProductionEquivalent: boolean,
): DatabaseParityResult {
  if (!requireProductionEquivalent || scope === 'PRODUCTION_EQUIVALENT') return result;
  return {
    ok: false,
    mismatches: [...result.mismatches, 'scope: expected "PRODUCTION_EQUIVALENT", received "LOCAL_REFERENCE"'],
  };
}
