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
import { OutboxWorkerPump } from '../platform/outbox/pump.js';
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
