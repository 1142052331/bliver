import { describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { io as socketClient, type Socket } from 'socket.io-client';
import { authenticateUser, registerUser, revokeSession } from '../../modules/identity/application/commands.js';
import { createMemoryIdentityRepositories } from '../../modules/identity/application/memory-repositories.js';
import { ConversationService, createMemoryConversationRepository } from '../../modules/conversations/index.js';
import { parseUserId } from '@bliver/domain';
import { ObservabilityRegistry } from '../../platform/observability/index.js';
import { InMemoryOutbox, OutboxWorker } from '../../platform/outbox/index.js';

import { configureRealtime, createConversationOutboxConsumer, createConversationSocketHandlers, emitFootprintPublished } from '../realtime.js';

describe('realtime privacy boundary', () => {
  it('delivers a persisted Socket message only after the Outbox worker claims it', async () => {
    const aliceId = parseUserId('019f0000-0000-7000-8000-000000000021');
    const bobId = parseUserId('019f0000-0000-7000-8000-000000000022');
    const pair = [aliceId, bobId].sort().join(':');
    const relationships = { async areFriends(left: string, right: string) { return [left, right].sort().join(':') === pair; }, async isBlocked() { return false; } };
    const outbox = new InMemoryOutbox();
    const repository = createMemoryConversationRepository();
    const appendEvent = repository.appendEvent.bind(repository);
    repository.appendEvent = async (event) => {
      await appendEvent(event);
      await outbox.append({ ...event, availableAt: 250 });
    };
    const conversations = new ConversationService(repository, relationships);
    const conversation = await conversations.getOrCreateDirectConversation(aliceId, bobId);
    const room = { emit: vi.fn() };
    const io = { to: vi.fn(() => room) };
    const handlers = createConversationSocketHandlers(conversations, io);

    await expect(handlers.message(aliceId, { conversationId: conversation.id, content: 'outbox message' })).resolves.toMatchObject({ content: 'outbox message' });
    expect(room.emit).not.toHaveBeenCalled();
    let current = 249;
    const worker = new OutboxWorker({ repository: outbox, process: createConversationOutboxConsumer(conversations, io), now: () => current });
    await expect(worker.runOnce()).resolves.toBe(false);
    current = 250;
    await expect(worker.runOnce()).resolves.toBe(true);
    expect(room.emit).toHaveBeenCalledTimes(2);
    expect(room.emit).toHaveBeenCalledWith('conversation:message', expect.objectContaining({ content: 'outbox message' }));
    expect((await outbox.list())[0]).toMatchObject({ attempts: 1, processedAt: 250 });
  });

  it('routes publication metadata to the owner room instead of broadcasting globally', () => {
    const room = { emit: vi.fn() };
    const io = { to: vi.fn(() => room), emit: vi.fn() };

    emitFootprintPublished(io, { footprintId: 'footprint-1', authorId: 'owner-1' });

    expect(io.to).toHaveBeenCalledWith('user:owner-1');
    expect(room.emit).toHaveBeenCalledWith('footprint:published', { footprintId: 'footprint-1', authorId: 'owner-1' });
    expect(io.emit).not.toHaveBeenCalled();
  });

  it('delivers validated conversation events to both authenticated clients and replays idempotently', async () => {
    const identity = createMemoryIdentityRepositories();
    const alice = await registerUser(identity, { username: 'socketalice', password: 'password-123' });
    const bob = await registerUser(identity, { username: 'socketbob', password: 'password-123' });
    const aliceGrant = await authenticateUser(identity, { username: 'socketalice', password: 'password-123', platform: 'capacitor' });
    const bobGrant = await authenticateUser(identity, { username: 'socketbob', password: 'password-123', platform: 'capacitor' });
    const pair = [alice.id, bob.id].sort().join(':');
    const relationships = { async areFriends(left: string, right: string) { return [left, right].sort().join(':') === pair; }, async isBlocked() { return false; } };
    const outbox = new InMemoryOutbox();
    const repository = createMemoryConversationRepository();
    const appendEvent = repository.appendEvent.bind(repository);
    repository.appendEvent = async (event) => { await appendEvent(event); await outbox.append(event); };
    const conversations = new ConversationService(repository, relationships);
    const conversation = await conversations.getOrCreateDirectConversation(parseUserId(alice.id), parseUserId(bob.id));
    const http = createServer();
    const io = new SocketServer(http);
    const observability = new ObservabilityRegistry();
    configureRealtime(io, identity, conversations, observability);
    const worker = new OutboxWorker({ repository: outbox, process: createConversationOutboxConsumer(conversations, io) });
    await new Promise<void>((resolve) => http.listen(0, resolve));
    const address = http.address();
    if (!address || typeof address === 'string') throw new Error('server address unavailable');
    const clients: Socket[] = [socketClient(`http://127.0.0.1:${address.port}`, { auth: { token: aliceGrant.accessToken }, forceNew: true }), socketClient(`http://127.0.0.1:${address.port}`, { auth: { token: bobGrant.accessToken }, forceNew: true })];
    try {
      await Promise.all(clients.map((client) => new Promise<void>((resolve, reject) => { client.once('connect', () => resolve()); client.once('connect_error', reject); })));
      clients[0]!.disconnect();
      clients[0]!.connect();
      await new Promise<void>((resolve, reject) => { clients[0]!.once('connect', resolve); clients[0]!.once('connect_error', reject); });
      expect(observability.snapshot().counters).toMatchObject({ socketConnections: 2, socketReconnects: 1 });
      const received: unknown[] = [];
      clients[1]!.on('conversation:message', (payload) => received.push(payload));
      const ack = await new Promise<{ ok: boolean; message?: { eventId: string }; code?: string }>((resolve) => clients[0]!.emit('conversation:message', { conversationId: conversation.id, content: 'hello socket', idempotencyKey: 'socket-message-1' }, resolve));
      expect(ack.ok).toBe(true);
      expect(ack.message?.eventId).toBeTruthy();
      await expect(worker.runOnce()).resolves.toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(received).toHaveLength(1);
      const replay = await new Promise<{ ok: boolean; message?: { eventId: string } }>((resolve) => clients[0]!.emit('conversation:message', { conversationId: conversation.id, content: 'hello socket', idempotencyKey: 'socket-message-1' }, resolve));
      expect(replay).toEqual({ ok: true, message: expect.objectContaining({ eventId: ack.message?.eventId }) });
      await expect(worker.runOnce()).resolves.toBe(false);
      expect(received).toHaveLength(1);
      const invalid = await new Promise<{ ok: boolean; code?: string }>((resolve) => clients[0]!.emit('conversation:message', { conversationId: conversation.id, content: '' }, resolve));
      expect(invalid).toEqual({ ok: false, code: 'INVALID_REQUEST' });
      await revokeSession(identity, aliceGrant.session.id);
      const revoked = await new Promise<{ ok: boolean; code?: string }>((resolve) => clients[0]!.emit('conversation:message', { conversationId: conversation.id, content: 'after revoke', idempotencyKey: 'socket-message-revoked' }, resolve));
      expect(revoked).toEqual({ ok: false, code: 'AUTH_REQUIRED' });
    } finally {
      for (const client of clients) client.close();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    }
  });
});
