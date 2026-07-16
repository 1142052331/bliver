import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';

import { V2_BUDGETS } from './budgets.js';

interface ExplainNode {
  readonly ['Node Type']?: string;
  readonly ['Plan Rows']?: number;
  readonly ['Relation Name']?: string;
  readonly Plans?: readonly ExplainNode[];
}

export function inspectExplainPlan(plan: ExplainNode): readonly string[] {
  const failures: string[] = [];
  const visit = (node: ExplainNode): void => {
    if (node['Node Type'] === 'Seq Scan' && (node['Plan Rows'] ?? 0) > V2_BUDGETS.maxApprovedSequentialScanRows) {
      failures.push(`sequential scan on ${node['Relation Name'] ?? 'unknown'} estimates ${node['Plan Rows']} rows`);
    }
    node.Plans?.forEach(visit);
  };
  visit(plan);
  return failures;
}

async function staticPostgisChecks(): Promise<readonly string[]> {
  const migration = await readFile(resolve('apps/api/drizzle/0002_geography_media_footprints.sql'), 'utf8');
  const repository = await readFile(resolve('apps/api/src/modules/footprints/infrastructure/postgres-repositories.ts'), 'utf8');
  const failures: string[] = [];
  if (!/footprints_display_point_gist_idx[\s\S]+USING gist \(display_point\)/i.test(migration)) failures.push('PostGIS footprint GIST index is missing');
  if (!repository.includes('display_point && ST_MakeEnvelope')) failures.push('Map query does not expose the indexed bounding-box operator');
  return failures;
}

export async function runMapQueryCheck(): Promise<{ readonly failures: readonly string[]; readonly liveExplain: boolean }> {
  const failures = [...await staticPostgisChecks()];
  const databaseUrl = process.env.DATABASE_URL ?? process.env.V2_DATABASE_URL;
  if (!databaseUrl) return { failures, liveExplain: false };
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await pool.query<Record<string, unknown>>(
      "EXPLAIN (FORMAT JSON) SELECT id FROM footprints WHERE display_point && ST_MakeEnvelope(121,31,122,32,4326)::geography AND visibility='public' LIMIT 100",
    );
    const raw = result.rows[0]?.['QUERY PLAN'] as Array<{ Plan?: ExplainNode }> | undefined;
    const plan = raw?.[0]?.Plan;
    if (!plan) failures.push('PostGIS EXPLAIN did not return a plan');
    else failures.push(...inspectExplainPlan(plan));
  } finally {
    await pool.end();
  }
  return { failures, liveExplain: true };
}
