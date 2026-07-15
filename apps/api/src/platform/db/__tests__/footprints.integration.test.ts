import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createFootprintId, createUserId } from '@bliver/domain';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, createDb, type DatabaseClient } from '../client.js';
import { migrateDatabase } from '../migrate.js';
import { resolvePostgisDatabaseUrl } from '../test-environment.js';

const migrationPath = resolve(
  import.meta.dirname,
  '../../../../drizzle/0002_geography_media_footprints.sql',
);
const externalDatabaseUrl = resolvePostgisDatabaseUrl();
const dockerAvailable = spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;

describe('footprint geography migration contract', () => {
  it('defines the footprint geography tables and indexes', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    for (const table of ['regions', 'places', 'footprints', 'footprint_media']) {
      expect(migration).toMatch(
        new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, 'i'),
      );
    }
    expect(migration).toMatch(/display_point geography\(Point,\s*4326\) NOT NULL/i);
    expect(migration).toMatch(/USING gist \(display_point\)/i);
    expect(migration).toMatch(/\(visibility, discovery_expires_at/i);
  });
});

describe.skipIf(!externalDatabaseUrl && !dockerAvailable)(
  'footprint PostGIS persistence',
  () => {
    let databaseUrl: string;
    let container: Awaited<ReturnType<PostgreSqlContainer['start']>>;
    let db: DatabaseClient;

    beforeAll(async () => {
      if (externalDatabaseUrl) {
        databaseUrl = externalDatabaseUrl;
      } else {
        container = await new PostgreSqlContainer('postgis/postgis:16-3.4')
          .withDatabase('bliver_v2_test')
          .withUsername('bliver')
          .withPassword('bliver_test')
          .start();
        databaseUrl = container.getConnectionUri();
      }

      await migrateDatabase(databaseUrl);
      db = createDb(databaseUrl);
    }, 120_000);

    afterAll(async () => {
      await closeDb();
      await container?.stop();
    });

    it('stores private and display points as non-null WGS84 geography points', async () => {
      const columns = await db.query<{
        column_name: string;
        type: string;
        srid: number;
        not_null: boolean;
      }>(
        `select a.attname as column_name,
                postgis_typmod_type(a.atttypmod) as type,
                postgis_typmod_srid(a.atttypmod) as srid,
                a.attnotnull as not_null
           from pg_attribute a
           join pg_class c on c.oid = a.attrelid
           join pg_type t on t.oid = a.atttypid
          where c.relname = 'footprints'
            and t.typname = 'geography'
            and a.attname in ('private_point', 'display_point')
          order by a.attname`,
      );

      expect(columns.rows).toEqual([
        { column_name: 'display_point', type: 'Point', srid: 4326, not_null: true },
        { column_name: 'private_point', type: 'Point', srid: 4326, not_null: true },
      ]);
    });

    it('uses the display point for viewport bounding-box queries', async () => {
      const authorId = createUserId();
      const insideId = createFootprintId();
      const outsideId = createFootprintId();
      const username = `geo_${Date.now().toString(36)}`;

      await db.query(
        `insert into identity_users (id, username, display_name)
         values ($1, $2, 'Geography Test')`,
        [authorId, username],
      );
      await db.query(
        `insert into footprints
           (id, author_id, private_point, display_point, visibility,
            location_precision, message, published_at, discovery_expires_at)
         values
           ($1, $3, ST_SetSRID(ST_MakePoint(116.4074, 39.9042), 4326)::geography,
            ST_SetSRID(ST_MakePoint(116.4074, 39.9042), 4326)::geography,
            'public', 'precise', 'Beijing', now(), now() + interval '24 hours'),
           ($2, $3, ST_SetSRID(ST_MakePoint(121.4737, 31.2304), 4326)::geography,
            ST_SetSRID(ST_MakePoint(121.4737, 31.2304), 4326)::geography,
            'public', 'precise', 'Shanghai', now(), now() + interval '24 hours')`,
        [insideId, outsideId, authorId],
      );

      const viewport = await db.query<{ id: string }>(
        `select id::text
           from footprints
          where display_point && ST_MakeEnvelope(116, 39, 117, 41, 4326)::geography
            and author_id = $1
          order by id`,
        [authorId],
      );

      expect(viewport.rows).toEqual([{ id: insideId }]);
    });

    it('installs GiST display-point and B-tree author, visibility, and expiry indexes', async () => {
      const indexes = await db.query<{ indexname: string; indexdef: string }>(
        `select indexname, indexdef
           from pg_indexes
          where schemaname = 'public'
            and tablename = 'footprints'`,
      );
      const definitions = indexes.rows.map(({ indexdef }) => indexdef).join('\n');

      expect(definitions).toMatch(/USING gist \(display_point\)/i);
      expect(definitions).toMatch(/USING btree \(author_id,/i);
      expect(definitions).toMatch(/USING btree \(visibility,/i);
      expect(definitions).toMatch(/discovery_expires_at/i);
    });

    it('rejects invalid audience, precision, missing display points, and orphan media', async () => {
      const authorId = createUserId();
      const username = `constraint_${Date.now().toString(36)}`;
      await db.query(
        `insert into identity_users (id, username, display_name)
         values ($1, $2, 'Constraint Test')`,
        [authorId, username],
      );

      const insertFootprint = (
        id: string,
        visibility: string,
        precision: string,
        includeDisplayPoint = true,
      ) =>
        db.query(
          `insert into footprints
             (id, author_id, private_point, display_point, visibility,
              location_precision, message)
           values
             ($1, $2, ST_SetSRID(ST_MakePoint(116.4, 39.9), 4326)::geography,
              ${includeDisplayPoint ? "ST_SetSRID(ST_MakePoint(116.4, 39.9), 4326)::geography" : 'null'},
              $3, $4, 'Constraint')`,
          [id, authorId, visibility, precision],
        );

      await expect(
        insertFootprint(createFootprintId(), 'followers', 'precise'),
      ).rejects.toThrow();
      await expect(
        insertFootprint(createFootprintId(), 'public', 'city'),
      ).rejects.toThrow();
      await expect(
        insertFootprint(createFootprintId(), 'public', 'precise', false),
      ).rejects.toThrow();
      await expect(
        db.query(
          `insert into footprint_media (id, footprint_id, asset_id)
           values ($1, $2, 'orphan-asset')`,
          [createFootprintId(), createFootprintId()],
        ),
      ).rejects.toThrow();
    });
  },
);
