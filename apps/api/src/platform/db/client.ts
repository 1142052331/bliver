import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { QueryResult, QueryResultRow } from 'pg';

export interface DatabaseClient {
  readonly orm: NodePgDatabase;
  query<TRow extends QueryResultRow>(
    statement: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<TRow>>;
}

let activePool: Pool | undefined;

export function createDb(databaseUrl: string): DatabaseClient {
  if (activePool) {
    throw new Error('Database client has already been created');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  activePool = pool;

  return {
    orm: drizzle(pool),
    query: async <TRow extends QueryResultRow>(
      statement: string,
      values: readonly unknown[] = [],
    ) => pool.query<TRow>(statement, [...values]),
  };
}

export async function closeDb(): Promise<void> {
  const pool = activePool;
  activePool = undefined;

  if (pool) {
    await pool.end();
  }
}
