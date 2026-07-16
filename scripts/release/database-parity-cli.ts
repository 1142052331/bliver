import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { Pool } from 'pg';

import { loadDatabaseUrl } from '../../apps/api/src/platform/db/environment.js';
import {
  captureDatabaseFingerprint,
  compareDatabaseParity,
  enforceDatabaseBaselineScope,
  toExpectedDatabaseBaseline,
  type DatabaseBaselineScope,
  type ExpectedDatabaseBaseline,
} from './database-parity.js';

const root = resolve(import.meta.dirname, '../..');

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function readBaseline(path: string): Promise<ExpectedDatabaseBaseline> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<ExpectedDatabaseBaseline>;
  if (
    parsed.schemaVersion !== 1
    || !parsed.server
    || !parsed.extensions
    || !parsed.settings
    || !parsed.migration
    || !['LOCAL_REFERENCE', 'PRODUCTION_EQUIVALENT'].includes(String(parsed.scope))
  ) {
    throw new Error('baseline file has an unsupported shape');
  }
  return parsed as ExpectedDatabaseBaseline;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const outputPath = option('--write') ?? option('--write-baseline');
  const baselinePath = option('--compare');
  const databaseUrl = loadDatabaseUrl();
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });

  let fingerprint;
  try {
    fingerprint = await captureDatabaseFingerprint(pool);
  } finally {
    await pool.end();
  }

  if (baselinePath) {
    const expected = await readBaseline(resolve(root, baselinePath));
    const requireProductionEquivalent = process.argv.includes('--require-production-equivalent');
    const comparison = enforceDatabaseBaselineScope(
      compareDatabaseParity(fingerprint, expected),
      expected.scope,
      requireProductionEquivalent,
    );
    const result = {
      schemaVersion: 1,
      checkedAt: new Date().toISOString(),
      status: comparison.ok ? 'PASS' : 'BLOCKED',
      baselineScope: expected.scope,
      fingerprint,
      comparison,
    } as const;
    if (outputPath) await writeJson(resolve(root, outputPath), result);
    console.log(JSON.stringify(result, null, 2));
    if (!comparison.ok) process.exitCode = 1;
    return;
  }

  const requestedScope = option('--scope') ?? 'LOCAL_REFERENCE';
  if (!['LOCAL_REFERENCE', 'PRODUCTION_EQUIVALENT'].includes(requestedScope)) {
    throw new Error('unsupported database baseline scope');
  }
  const baseline = toExpectedDatabaseBaseline(fingerprint, requestedScope as DatabaseBaselineScope);
  if (option('--write-baseline')) {
    await writeJson(resolve(root, option('--write-baseline') as string), baseline);
  } else if (option('--write')) {
    await writeJson(resolve(root, option('--write') as string), fingerprint);
  }
  console.log(JSON.stringify(fingerprint, null, 2));
}

main().catch((error: unknown) => {
  const code = (error as { readonly code?: string } | undefined)?.code;
  console.error(`Database parity failed${code ? ` (${code})` : ''}: unable to inspect target database`);
  process.exitCode = 1;
});
