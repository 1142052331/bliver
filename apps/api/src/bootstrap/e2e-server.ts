import { createServer } from 'node:http';
import express from 'express';
import pino from 'pino';
import { Server as SocketServer } from 'socket.io';
import { parseFootprintId, parseUserId, type FootprintId } from '@bliver/domain';
import {
  createJourneyState,
  V2_TEST_FOOTPRINTS,
  type V2TestFootprint,
} from '@bliver/testing';

import { createApp } from '../http/app.js';
import { createMemoryIdentityRepositories } from '../modules/identity/application/memory-repositories.js';
import { ConversationService, createMemoryConversationRepository } from '../modules/conversations/index.js';
import { createMemoryDiscoveryRepository, DiscoveryQueryService } from '../modules/discovery/index.js';
import { BlockPolicy, SocialService, createMemorySocialRepository } from '../modules/social/index.js';
import {
  createMemoryFootprintRepositories,
  FootprintVisibilityPolicy,
  type FootprintPolicyInput,
  type FootprintRepositories,
} from '../modules/footprints/index.js';
import { InMemoryOutbox, OutboxWorker } from '../platform/outbox/index.js';
import { OutboxWorkerPump } from '../platform/outbox/pump.js';
import { configureRealtime, createConversationOutboxConsumer } from './realtime.js';

const identity = createMemoryIdentityRepositories();
const relationships = createMemorySocialRepository();
const social = new SocialService(relationships);
const journeyState = createJourneyState();
const previewMediaUrls = [
  'https://res.cloudinary.com/demo/image/upload/c_fill,w_1200,h_800,q_auto,f_auto/sample.jpg',
  'https://res.cloudinary.com/demo/image/upload/c_fill,w_1200,h_800,q_auto,f_auto/cld-sample-2.jpg',
  'https://res.cloudinary.com/demo/image/upload/c_fill,w_1200,h_800,q_auto,f_auto/cld-sample-3.jpg',
  'https://res.cloudinary.com/demo/image/upload/c_fill,w_1200,h_800,q_auto,f_auto/cld-sample-4.jpg',
] as const;

const tokyoPreviewFootprints: readonly V2TestFootprint[] = [
  {
    id: '019f0000-0000-7000-8000-000000000741',
    author: { id: '019f0000-0000-7000-8000-000000000751', name: 'Aoi' },
    displayPoint: { lat: 35.6595, lng: 139.7005 },
    visibility: 'public',
    locationPrecision: 'approximate',
    message: 'Shibuya after the rain',
    mood: 'calm',
    publishedAt: '2026-07-19T12:40:00.000Z',
    discoveryExpiresAt: '2099-07-19T12:40:00.000Z',
  },
  {
    id: '019f0000-0000-7000-8000-000000000742',
    author: { id: '019f0000-0000-7000-8000-000000000752', name: 'Ren' },
    displayPoint: { lat: 35.6938, lng: 139.7034 },
    visibility: 'public',
    locationPrecision: 'approximate',
    message: 'Last light over Shinjuku',
    mood: 'radiant',
    publishedAt: '2026-07-19T11:20:00.000Z',
    discoveryExpiresAt: '2099-07-19T11:20:00.000Z',
  },
  {
    id: '019f0000-0000-7000-8000-000000000743',
    author: { id: '019f0000-0000-7000-8000-000000000753', name: 'Mika' },
    displayPoint: { lat: 35.7148, lng: 139.7967 },
    visibility: 'public',
    locationPrecision: 'approximate',
    message: 'A quiet morning in Asakusa',
    mood: 'quiet',
    publishedAt: '2026-07-19T08:10:00.000Z',
    discoveryExpiresAt: '2099-07-19T08:10:00.000Z',
  },
  {
    id: '019f0000-0000-7000-8000-000000000744',
    author: { id: '019f0000-0000-7000-8000-000000000754', name: 'Haru' },
    displayPoint: { lat: 35.6277, lng: 139.7758 },
    visibility: 'public',
    locationPrecision: 'approximate',
    message: '傍晚的海风穿过台场，城市的灯刚刚亮起来。',
    mood: 'tender',
    publishedAt: '2026-07-19T06:30:00.000Z',
    discoveryExpiresAt: '2099-07-19T06:30:00.000Z',
  },
];

type PreviewRecord = FootprintPolicyInput & { readonly message: string };

function toPreviewRecord(item: V2TestFootprint, mediaUrl?: string): PreviewRecord {
  return {
    id: parseFootprintId(item.id),
    authorId: parseUserId(item.author.id),
    author: { name: item.author.name },
    displayPoint: item.displayPoint,
    visibility: item.visibility,
    locationPrecision: item.locationPrecision,
    message: item.message,
    ...(item.mood ? { mood: item.mood } : {}),
    publishedAt: new Date(item.publishedAt),
    discoveryExpiresAt: new Date(item.discoveryExpiresAt),
    ...(mediaUrl
      ? { primaryMedia: { url: mediaUrl, width: 1200, height: 800 } }
      : {}),
  };
}

const mapRecords: readonly PreviewRecord[] = [
  ...V2_TEST_FOOTPRINTS.map((item) =>
    toPreviewRecord(item, item.visibility === 'public' ? previewMediaUrls[0] : undefined)),
  ...tokyoPreviewFootprints.map((item, index) =>
    // Keep one public text-only moment available for the real map-card preview.
    toPreviewRecord(
      item,
      item.id === '019f0000-0000-7000-8000-000000000744'
        ? undefined
        : previewMediaUrls[index],
    ),
  ),
];
const previewRecordsById = new Map(mapRecords.map((record) => [record.id, record]));
const memoryFootprints = createMemoryFootprintRepositories();
const findPreviewRecord = async (id: FootprintId): Promise<PreviewRecord | null> =>
  previewRecordsById.get(id) ?? await memoryFootprints.publicDetails?.findById(id) ?? null;
const previewFootprints: FootprintRepositories = {
  ...memoryFootprints,
  publicDetails: { findById: findPreviewRecord },
};
const previewFootprintPolicy = new FootprintVisibilityPolicy({
  records: { findById: findPreviewRecord },
  friendships: { async areAcceptedFriends() { return false; } },
  blocks: { async isEitherBlocked() { return false; } },
  moderation: { async hasCaseAccess() { return false; } },
  now: () => new Date(),
});
const previewActivity = new DiscoveryQueryService({
  repository: createMemoryDiscoveryRepository(
    mapRecords.map((record) => ({
      ...record,
      hasMedia: Boolean(record.primaryMedia),
    })),
  ),
  policy: previewFootprintPolicy,
  cursorSecret: 'e2e-session-secret-must-be-at-least-32-characters',
});
const outbox = new InMemoryOutbox();
const conversationRepository = createMemoryConversationRepository();
const appendConversationEvent = conversationRepository.appendEvent.bind(conversationRepository);
conversationRepository.appendEvent = async (event) => {
  await appendConversationEvent(event);
  await outbox.append({ ...event, availableAt: Date.now() + journeyState.outboxDelayMs });
};
const conversations = new ConversationService(conversationRepository, relationships);
const failedMessageDeliveries = new Set<string>();
const productApp = createApp({
  config: {
    nodeEnv: 'test',
    deployEnv: 'test',
    releaseSha: 'e2e',
    databaseUrl: 'postgres://unused',
    sessionSecret: 'e2e-session-secret-must-be-at-least-32-characters',
    port: 5100,
    cloudinary: undefined,
    push: undefined,
  },
  logger: pino({ level: 'silent' }),
  identity,
  identityProfileAccess: new BlockPolicy(relationships),
  footprints: {
    repositories: previewFootprints,
    policy: previewFootprintPolicy,
  },
  map: { records: mapRecords },
  discovery: { activity: previewActivity },
  social: { service: social },
  conversations: { service: conversations },
});
const app = express();
app.use(express.json({ limit: '16kb' }));
app.put('/__e2e__/outbox-control', (request, response) => {
  const delayMs = Number(request.body?.delayMs);
  const failMessageId = request.body?.failMessageId;
  const validFailureId = failMessageId === undefined || (typeof failMessageId === 'string' && /^[\w-]{1,128}$/.test(failMessageId));
  if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 5_000 || !validFailureId) {
    response.status(400).json({ code: 'INVALID_OUTBOX_CONTROL' });
    return;
  }
  journeyState.outboxDelayMs = delayMs;
  if (typeof failMessageId === 'string') failedMessageDeliveries.add(failMessageId);
  response.json({ delayMs, ...(typeof failMessageId === 'string' ? { failMessageId } : {}) });
});
app.get('/__e2e__/outbox-events', (_request, response) => { void outbox.list().then((items) => response.json({ items })); });
app.use(productApp);
const server = createServer(app);
const io = new SocketServer(server, { cors: { origin: false } });
configureRealtime(io, identity, conversations);
const consumeConversationEvent = createConversationOutboxConsumer(conversations, io);
const outboxWorker = new OutboxWorker({
  repository: outbox,
  baseDelayMs: 100,
  process: async (event) => {
    const messageId = event.payload.messageId;
    if (event.type === 'MessageSent' && typeof messageId === 'string' && failedMessageDeliveries.delete(messageId)) {
      throw new Error('E2E_OUTBOX_RETRY');
    }
    await consumeConversationEvent(event);
  },
});
const workerPump = new OutboxWorkerPump({ worker: outboxWorker, intervalMs: 25 });
workerPump.start();
server.listen(5100, '127.0.0.1');
const close = (): void => {
  void workerPump.stop().then(
    () => io.close(() => server.close(() => process.exit(0))),
    () => process.exit(1),
  );
};
process.once('SIGINT', close);
process.once('SIGTERM', close);
