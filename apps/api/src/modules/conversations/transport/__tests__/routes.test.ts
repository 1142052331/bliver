import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createConfig } from '../../../../bootstrap/config.js';
import { createApp } from '../../../../http/app.js';
import { createMemoryIdentityRepositories } from '../../../identity/index.js';

const config = createConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgres://localhost/bliver_test', SESSION_SECRET: 'test-secret-that-is-definitely-long-enough' });

async function createUser(app: ReturnType<typeof createApp>, username: string) {
  const registration = await request(app).post('/api/v1/auth/register').send({ username, password: 'password-123' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ username, password: 'password-123', platform: 'capacitor' }).expect(200);
  return { id: String(registration.body.user.id), auth: { Authorization: `Bearer ${String(login.body.accessToken)}` } };
}

describe('conversation routes', () => {
  it('sends one greeting, replies to unlock, paginates history, and replays messages', async () => {
    const app = createApp({ config, identity: createMemoryIdentityRepositories() });
    const alice = await createUser(app, 'msgalice');
    const bob = await createUser(app, 'msgbob');
    await request(app).post(`/api/v1/users/${bob.id}/greetings`).set(alice.auth).send({ content: 'hello' }).expect(201);
    const greeting = await request(app).post(`/api/v1/users/${bob.id}/greetings`).set(alice.auth).send({ content: 'again' }).expect(409);
    expect(greeting.body.code).toBe('GREETING_ALREADY_SENT');

    const list = await request(app).get('/api/v1/conversations').set(bob.auth).expect(200);
    const conversationId = String(list.body.items[0].id);
    const reply = await request(app).post(`/api/v1/conversations/${conversationId}/reply`).set(bob.auth).set('Idempotency-Key', 'reply-1').send({ content: 'hi' }).expect(200);
    expect(reply.body.message.senderId).toBe(bob.id);
    const replay = await request(app).post(`/api/v1/conversations/${conversationId}/reply`).set(bob.auth).set('Idempotency-Key', 'reply-1').send({ content: 'hi' }).expect(200);
    expect(replay.body).toEqual(reply.body);

    const sent = await request(app).post(`/api/v1/conversations/${conversationId}/messages`).set(alice.auth).set('Idempotency-Key', 'message-1').send({ content: 'welcome' }).expect(201);
    expect(sent.body.content).toBe('welcome');
    const history = await request(app).get(`/api/v1/conversations/${conversationId}/messages?limit=1`).set(alice.auth).expect(200);
    expect(history.body.items).toHaveLength(1);
    expect(history.body.nextCursor).toEqual(expect.any(String));
    await request(app).post(`/api/v1/conversations/${conversationId}/read`).set(bob.auth).send({ messageId: sent.body.id }).expect(204);
  });

  it('hides blocked conversations and requires an authenticated actor', async () => {
    const app = createApp({ config, identity: createMemoryIdentityRepositories() });
    const alice = await createUser(app, 'blockmsgalice');
    const bob = await createUser(app, 'blockmsgbob');
    await request(app).get('/api/v1/conversations').expect(401);
    await request(app).post(`/api/v1/users/${bob.id}/greetings`).set(alice.auth).send({ content: 'hello' }).expect(201);
    const list = await request(app).get('/api/v1/conversations').set(alice.auth).expect(200);
    const id = String(list.body.items[0].id);
    await request(app).put(`/api/v1/blocks/${bob.id}`).set(alice.auth).expect(200);
    await request(app).get(`/api/v1/conversations/${id}/messages`).set(bob.auth).expect(404);
  });
});
