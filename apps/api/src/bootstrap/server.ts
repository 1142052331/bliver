import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

import pino from 'pino';

import { createConfig } from './config.js';
import { closeDb, createDb } from '../platform/db/client.js';
import { createApp } from '../http/app.js';

export async function startServer(): Promise<void> {
  const config = createConfig();
  const logger = pino({ level: config.nodeEnv === 'production' ? 'info' : 'silent' });
  const db = createDb(config.databaseUrl);
  const app = createApp({ config, db, logger });
  const server = createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, () => resolve());
  });

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeDb();
  };

  process.once('SIGTERM', () => {
    void shutdown().then(() => process.exit(0));
  });
  process.once('SIGINT', () => {
    void shutdown().then(() => process.exit(0));
  });
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  startServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    console.error(`API server failed: ${message}`);
    process.exitCode = 1;
  });
}
