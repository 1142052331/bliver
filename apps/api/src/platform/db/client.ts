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
    transaction: async <T>(callback: (client: DatabaseQueryPort) => Promise<T>) => {
      const client: PoolClient = await pool.connect();
      try {
        return await executeTransaction({ query: async <TRow extends QueryResultRow>(statement: string, values: readonly unknown[] = []) => client.query<TRow>(statement, [...values]) }, callback);
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
