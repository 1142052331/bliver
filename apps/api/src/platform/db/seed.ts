import { pathToFileURL } from 'node:url';

import { closeDb, createDb } from './client.js';
import { loadDatabaseUrl } from './environment.js';

export async function seedFoundation(databaseUrl: string): Promise<void> {
  const db = createDb(databaseUrl);

  try {
    await db.query(
      `insert into platform.system_markers (id)
       values ($1)
       on conflict (id) do nothing`,
      ['v2-foundation'],
    );
  } finally {
    await closeDb();
  }
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  seedFoundation(loadDatabaseUrl()).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown seed error';
    console.error(`Database seed failed: ${message}`);
    process.exitCode = 1;
  });
}
