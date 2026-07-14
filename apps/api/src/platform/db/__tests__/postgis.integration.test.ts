import { spawnSync } from 'node:child_process';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, createDb } from '../client.js';
import { migrateDatabase } from '../migrate.js';

const dockerAvailable =
  spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;

describe.skipIf(!dockerAvailable)('PostGIS foundation migration', () => {
  let databaseUrl: string;
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>>;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4')
      .withDatabase('bliver_v2_test')
      .withUsername('bliver')
      .withPassword('bliver_test')
      .start();
    databaseUrl = container.getConnectionUri();
  }, 120_000);

  afterAll(async () => {
    await closeDb();
    await container?.stop();
  });

  it('enables PostGIS and applies the migration exactly once', async () => {
    await migrateDatabase(databaseUrl);
    const db = createDb(databaseUrl);
    const firstMigrationCount = await db.query<{ count: string }>(
      'select count(*)::text as count from drizzle.__drizzle_migrations',
    );

    await migrateDatabase(databaseUrl);

    const secondMigrationCount = await db.query<{ count: string }>(
      'select count(*)::text as count from drizzle.__drizzle_migrations',
    );
    const postgis = await db.query<{ available: boolean; database: boolean }>(
      `select PostGIS_Version() is not null as available,
              current_database() = 'bliver_v2_test' as database`,
    );

    expect(postgis.rows[0]).toEqual({ available: true, database: true });
    expect(firstMigrationCount.rows[0]?.count).toBe('1');
    expect(secondMigrationCount.rows[0]?.count).toBe('1');
  }, 120_000);
});
