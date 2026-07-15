import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

import pino from 'pino';

import { createConfig } from './config.js';
import { closeDb, createDb } from '../platform/db/client.js';
import { createApp } from '../http/app.js';
import { createPostgresIdentityRepositories } from '../modules/identity/infrastructure/postgres-repositories.js';
import { CloudinaryAdapter, MediaService, createPostgresMediaRepositories } from '../modules/media/index.js';
import { FootprintVisibilityPolicy, MapFootprintQuery, createPostgresFootprintRepositories } from '../modules/footprints/index.js';
import { createPostgresOutboxRepository, OutboxWorker } from '../platform/outbox/index.js';
import { Server as SocketServer } from 'socket.io';
import { createNominatimGeography } from '../platform/geography/providers.js';
import { configureRealtime, emitFootprintPublished } from './realtime.js';

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
  const identity = createPostgresIdentityRepositories(db);
  const mediaRepositories = createPostgresMediaRepositories(db);
  const media = new MediaService({ adapter: new CloudinaryAdapter(config.cloudinary), repositories: mediaRepositories });
  const footprints = createPostgresFootprintRepositories(db);
  const policy = new FootprintVisibilityPolicy({ records: footprints, friendships: { async areAcceptedFriends() { throw new Error('Relationship persistence is not available'); } }, blocks: { async isEitherBlocked() { throw new Error('Relationship persistence is not available'); } }, moderation: { async hasCaseAccess() { return false; } }, now: () => new Date() }, { denyAuthenticatedNonOwners: true });
  const map = new MapFootprintQuery({ repository: footprints, policy });
  const geography = createNominatimGeography();
  const app = createApp({ config, db, logger, identity, media, footprints: { repositories: footprints, policy, providers: { geocoding: { async resolve(point) { const result = await geography.geocode({ latitude: point.lat, longitude: point.lng }); return { placeId: result.place?.id ?? null, regionId: result.region?.id ?? null }; } }, weather: { async resolve(point) { return geography.weather({ latitude: point.lat, longitude: point.lng }); } } } }, map: { query: map, geography } });
  const server = createServer(app);
  const io = new SocketServer(server, { cors: { origin: false } });
  configureRealtime(io, identity);
  const outboxWorker = new OutboxWorker({ repository: createPostgresOutboxRepository(db), process: async (event) => { if (event.type === 'FootprintPublished') emitFootprintPublished(io, event.payload as { authorId: string }); } });
  const workerTimer = setInterval(() => { void outboxWorker.runOnce(); }, 250);
  workerTimer.unref();

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, () => resolve());
  });

  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (): Promise<void> => {
    clearInterval(workerTimer);
    io.close();
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
