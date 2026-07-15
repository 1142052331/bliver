import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

import pino from 'pino';

import { createConfig } from './config.js';
import { closeDb, createDb } from '../platform/db/client.js';
import { createApp } from '../http/app.js';
import { createPostgresIdentityRepositories } from '../modules/identity/infrastructure/postgres-repositories.js';
import { CloudinaryAdapter, MediaService, createPostgresMediaRepositories } from '../modules/media/index.js';
import { FootprintVisibilityPolicy, MapFootprintQuery, createPostgresFootprintRepositories } from '../modules/footprints/index.js';
import { DiscoveryQueryService, DiscoveryProjectionConsumer, createPostgresDiscoveryRepository } from '../modules/discovery/index.js';
import { InteractionService, createPostgresInteractionRepository } from '../modules/interactions/index.js';
import { CreateReport, createPostgresReportRepository } from '../modules/moderation/index.js';
import { createPostgresCommandIdempotencyRepository } from '../platform/idempotency/index.js';
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
  const mapAccessFilter = ({ viewerId, addParameter }: { viewerId: string | null; addParameter: (value: unknown) => string }): string => {
    if (!viewerId) return `f.visibility = 'public' AND f.discovery_expires_at > CURRENT_TIMESTAMP`;
    const viewer = addParameter(viewerId);
    return `NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id=${viewer} AND b.blocked_id=f.author_id) OR (b.blocker_id=f.author_id AND b.blocked_id=${viewer})) AND (f.author_id=${viewer} OR (f.visibility='public' AND f.discovery_expires_at>CURRENT_TIMESTAMP) OR (f.visibility<>'private' AND EXISTS (SELECT 1 FROM friendships r WHERE r.status='accepted' AND ((r.requester_id=${viewer} AND r.addressee_id=f.author_id) OR (r.addressee_id=${viewer} AND r.requester_id=f.author_id))))`;
  };
  const footprints = createPostgresFootprintRepositories(db, { mapAccessFilter });
  const relationships = {
    async areAcceptedFriends(viewerId: string, authorId: string) { const result = await db.query('SELECT 1 FROM friendships WHERE status=$3 AND ((requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)) LIMIT 1', [viewerId, authorId, 'accepted']); return Boolean(result.rowCount); },
    async isEitherBlocked(viewerId: string, authorId: string) { const result = await db.query('SELECT 1 FROM user_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1', [viewerId, authorId]); return Boolean(result.rowCount); },
  };
  const policy = new FootprintVisibilityPolicy({ records: footprints, friendships: relationships, blocks: relationships, moderation: { async hasCaseAccess() { return false; } }, now: () => new Date() });
  const map = new MapFootprintQuery({ repository: footprints, policy, cursorSecret: config.sessionSecret });
  const discoveryRepository = createPostgresDiscoveryRepository(db);
  const activity = new DiscoveryQueryService({ repository: discoveryRepository, policy, cursorSecret: config.sessionSecret });
  const geography = createNominatimGeography();
  const interactionService = new InteractionService(createPostgresInteractionRepository(db), { async canInteract(actor, footprintId) { return policy.canRead(actor, footprintId); }, async canRead(actor, footprintId) { return policy.canRead(actor, footprintId); }, async isBlocked(actorId, targetId) { return relationships.isEitherBlocked(actorId, targetId); }, async footprintOwner(footprintId) { return (await footprints.findById(footprintId))?.authorId ?? null; } });
  const reportCreate = new CreateReport(createPostgresReportRepository(db), { async canReport(actor, footprintId) { return policy.canRead(actor, footprintId); } });
  const commandIdempotency = createPostgresCommandIdempotencyRepository(db);
  const regionForActor = async (actor: { readonly userId: string } | null): Promise<{ regionId?: string; countryCode?: string }> => {
    if (!actor) return {};
    const result = await db.query<{ region_id: string | null; country_code: string | null }>('SELECT f.region_id, r.country_code FROM footprints f LEFT JOIN regions r ON r.id=f.region_id WHERE f.author_id=$1 AND f.region_id IS NOT NULL ORDER BY f.published_at DESC, f.id DESC LIMIT 1', [actor.userId]);
    const row = result.rows[0];
    return row ? { ...(row.region_id ? { regionId: row.region_id } : {}), ...(row.country_code ? { countryCode: row.country_code } : {}) } : {};
  };
  const app = createApp({
    config,
    db,
    logger,
    identity,
    media,
    footprints: {
      repositories: footprints,
      policy,
      providers: {
        geocoding: { async resolve(point) { const result = await geography.geocode({ latitude: point.lat, longitude: point.lng }); return { placeId: result.place?.id ?? null, regionId: result.region?.id ?? null }; } },
        weather: { async resolve(point) { return geography.weather({ latitude: point.lat, longitude: point.lng }); } },
      },
    },
    map: { query: map, geography },
    discovery: { activity, map, regionForActor },
    interactions: { service: interactionService, idempotency: commandIdempotency },
    reports: { create: reportCreate, idempotency: commandIdempotency },
  });
  const server = createServer(app);
  const io = new SocketServer(server, { cors: { origin: false } });
  configureRealtime(io, identity);
  const projection = new DiscoveryProjectionConsumer({ repository: discoveryRepository, source: { async findById(id) { const [publicRecord, fullRecord] = await Promise.all([footprints.findById(id as never), footprints.footprints.findById(id as never)]); if (!publicRecord || !fullRecord) return null; let countryCode: string | null = null; if (fullRecord.metadata.regionId) { const region = await db.query<{ country_code: string }>('SELECT country_code FROM regions WHERE id=$1', [fullRecord.metadata.regionId]); countryCode = region.rows[0]?.country_code ?? null; } return { ...publicRecord, message: fullRecord.message, hasMedia: fullRecord.mediaAssetIds.length > 0, regionId: fullRecord.metadata.regionId, countryCode }; } } });
  const outboxWorker = new OutboxWorker({ repository: createPostgresOutboxRepository(db), process: async (event) => { if (event.type === 'FootprintPublished' || event.type === 'FootprintVisibilityUpdated' || event.type === 'FootprintVisibilityChanged' || event.type === 'FootprintDeleted') await projection.process(event as never); if (event.type === 'FootprintPublished') emitFootprintPublished(io, event.payload as { authorId: string }); } });
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
