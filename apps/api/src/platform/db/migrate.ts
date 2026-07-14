import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';

import { loadDatabaseUrl } from './environment.js';

const migrationsFolder = resolve(import.meta.dirname, '../../../drizzle');

export async function migrateDatabase(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });

  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  await migrateDatabase(loadDatabaseUrl());
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown migration error';
    console.error(`Database migration failed: ${message}`);
    process.exitCode = 1;
  });
}
