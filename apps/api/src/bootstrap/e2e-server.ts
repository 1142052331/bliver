import { createServer } from 'node:http';
import express from 'express';
import pino from 'pino';
import { Server as SocketServer } from 'socket.io';
import { createJourneyState } from '@bliver/testing';

import { createApp } from '../http/app.js';
import { createMemoryIdentityRepositories } from '../modules/identity/application/memory-repositories.js';
import { ConversationService, createMemoryConversationRepository } from '../modules/conversations/index.js';
import { SocialService, createMemorySocialRepository } from '../modules/social/index.js';
import { configureRealtime } from './realtime.js';

const identity = createMemoryIdentityRepositories();
const relationships = createMemorySocialRepository();
const social = new SocialService(relationships);
const conversations = new ConversationService(createMemoryConversationRepository(), relationships);
const journeyState = createJourneyState();
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
app.put('/__e2e__/outbox-delay', (request, response) => {
  const delayMs = Number(request.body?.delayMs);
  if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 5_000) {
    response.status(400).json({ code: 'INVALID_DELAY' });
    return;
  }
  journeyState.outboxDelayMs = delayMs;
  response.json({ delayMs });
});
app.use(productApp);
const server = createServer(app);
const io = new SocketServer(server, { cors: { origin: false } });
configureRealtime(io, identity, conversations, undefined, { deliveryDelayMs: () => journeyState.outboxDelayMs });
server.listen(5100, '127.0.0.1');
const close = (): void => {
  io.close(() => server.close(() => process.exit(0)));
};
process.once('SIGINT', close);
process.once('SIGTERM', close);
