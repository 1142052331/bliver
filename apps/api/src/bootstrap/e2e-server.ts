import { createServer } from 'node:http';
import express from 'express';
import pino from 'pino';
import { Server as SocketServer } from 'socket.io';
import { createJourneyState } from '@bliver/testing';

import { createApp } from '../http/app.js';
import { createMemoryIdentityRepositories } from '../modules/identity/application/memory-repositories.js';
import { ConversationService, createMemoryConversationRepository } from '../modules/conversations/index.js';
import { SocialService, createMemorySocialRepository } from '../modules/social/index.js';
import { InMemoryOutbox, OutboxWorker } from '../platform/outbox/index.js';
import { configureRealtime, createConversationOutboxConsumer } from './realtime.js';

const identity = createMemoryIdentityRepositories();
const relationships = createMemorySocialRepository();
const social = new SocialService(relationships);
const journeyState = createJourneyState();
const outbox = new InMemoryOutbox();
const conversationRepository = createMemoryConversationRepository();
const appendConversationEvent = conversationRepository.appendEvent.bind(conversationRepository);
conversationRepository.appendEvent = async (event) => {
  await appendConversationEvent(event);
  await outbox.append({ ...event, availableAt: Date.now() + journeyState.outboxDelayMs });
};
const conversations = new ConversationService(conversationRepository, relationships);
let failNextMessageDeliveries = 0;
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
  social: { service: social },
  conversations: { service: conversations },
});
const app = express();
app.use(express.json({ limit: '16kb' }));
app.put('/__e2e__/outbox-control', (request, response) => {
  const delayMs = Number(request.body?.delayMs);
  const failNext = Number(request.body?.failNext ?? 0);
  if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 5_000 || !Number.isInteger(failNext) || failNext < 0 || failNext > 3) {
    response.status(400).json({ code: 'INVALID_OUTBOX_CONTROL' });
    return;
  }
  journeyState.outboxDelayMs = delayMs;
  failNextMessageDeliveries = failNext;
  response.json({ delayMs, failNext });
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
    if (event.type === 'MessageSent' && failNextMessageDeliveries > 0) {
      failNextMessageDeliveries -= 1;
      throw new Error('E2E_OUTBOX_RETRY');
    }
    await consumeConversationEvent(event);
  },
});
const workerTimer = setInterval(() => { void outboxWorker.runOnce(); }, 25);
workerTimer.unref();
server.listen(5100, '127.0.0.1');
const close = (): void => {
  clearInterval(workerTimer);
  io.close(() => server.close(() => process.exit(0)));
};
process.once('SIGINT', close);
process.once('SIGTERM', close);
