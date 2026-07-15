import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

import pino from 'pino';

import { createConfig } from './config.js';
import { closeDb, createDb } from '../platform/db/client.js';
import { createApp } from '../http/app.js';
import { createPostgresIdentityRepositories } from '../modules/identity/infrastructure/postgres-repositories.js';

export interface ShutdownServerPort {
  close(callback: (error?: Error) => void): unknown;
  closeAllConnections(): void;
}

export async function shutdownServer(
  server: ShutdownServerPort,
  closeDatabase: () => Promise<void>,
  timeoutMs = 10_000,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.closeAllConnections();
      resolve();
    }, timeoutMs);
    timeout.unref();

    server.close((error?: Error) => {
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    });
  });

  await closeDatabase();
}

export async function startServer(): Promise<void> {
  const config = createConfig();
  const logger = pino({ level: config.nodeEnv === 'production' ? 'info' : 'silent' });
  const db = createDb(config.databaseUrl);
  const app = createApp({ config, db, logger, identity: createPostgresIdentityRepositories(db) });
  const server = createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, () => resolve());
  });

  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (): Promise<void> => {
    shutdownPromise ??= shutdownServer(server, closeDb);
    return shutdownPromise;
  };

  const handleSignal = (): void => {
    void shutdown().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };

  process.once('SIGTERM', handleSignal);
  process.once('SIGINT', handleSignal);
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  startServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    console.error(`API server failed: ${message}`);
    process.exitCode = 1;
  });
}
