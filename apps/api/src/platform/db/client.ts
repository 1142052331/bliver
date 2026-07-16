import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { QueryResult, QueryResultRow } from 'pg';
import type { PoolClient } from 'pg';

export interface DatabaseQueryPort {
  query<TRow extends QueryResultRow>(statement: string, values?: readonly unknown[]): Promise<QueryResult<TRow>>;
}

export interface DatabaseClient {
  readonly orm: NodePgDatabase;
  query<TRow extends QueryResultRow>(
    statement: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<TRow>>;
  transaction<T>(callback: (client: DatabaseQueryPort) => Promise<T>): Promise<T>;
}

export interface DatabaseObservability { dependency(name: 'dbPool' | 'slowQuery', healthy: boolean): void; }

export async function observeDatabaseQuery<T>(
  operation: () => Promise<T>,
  observability?: DatabaseObservability,
  now: () => number = () => performance.now(),
  slowQueryMs = 500,
): Promise<T> {
  const started = now();
  try { return await operation(); }
  catch (error) { observability?.dependency('dbPool', false); throw error; }
  finally { if (now() - started >= slowQueryMs) observability?.dependency('slowQuery', false); }
}

export async function executeTransaction<T>(client: DatabaseQueryPort, callback: (client: DatabaseQueryPort) => Promise<T>): Promise<T> {
  await client.query('BEGIN');
  try {
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

let activePool: Pool | undefined;

export function createDb(databaseUrl: string, options: { readonly observability?: DatabaseObservability; readonly slowQueryMs?: number; readonly now?: () => number } = {}): DatabaseClient {
  if (activePool) {
    throw new Error('Database client has already been created');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  activePool = pool;
  pool.on('error', () => options.observability?.dependency('dbPool', false));
  const observed = <T>(operation: () => Promise<T>): Promise<T> => observeDatabaseQuery(operation, options.observability, options.now, options.slowQueryMs);

  return {
    orm: drizzle(pool),
    query: async <TRow extends QueryResultRow>(
      statement: string,
      values: readonly unknown[] = [],
    ) => observed(() => pool.query<TRow>(statement, [...values])),
    transaction: async <T>(callback: (client: DatabaseQueryPort) => Promise<T>) => {
      let client: PoolClient;
      try { client = await pool.connect(); }
      catch (error) { options.observability?.dependency('dbPool', false); throw error; }
      try {
        return await executeTransaction({ query: async <TRow extends QueryResultRow>(statement: string, values: readonly unknown[] = []) => observed(() => client.query<TRow>(statement, [...values])) }, callback);
      } finally {
        client.release();
      }
    },
  };
}

export async function closeDb(): Promise<void> {
  const pool = activePool;
  activePool = undefined;

  if (pool) {
    await pool.end();
  }
}
