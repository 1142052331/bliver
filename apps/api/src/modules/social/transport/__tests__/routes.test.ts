import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createConfig } from '../../../../bootstrap/config.js';
import { createApp } from '../../../../http/app.js';
import { createMemoryIdentityRepositories } from '../../../identity/index.js';

const config = createConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://localhost/bliver_test',
  SESSION_SECRET: 'test-secret-that-is-definitely-long-enough',
});

async function createUser(app: ReturnType<typeof createApp>, username: string) {
  const registration = await request(app)
    .post('/api/v1/auth/register')
    .send({ username, password: 'password-123' })
    .expect(201);
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password: 'password-123', platform: 'capacitor' })
    .expect(200);
  return {
    id: String(registration.body.user.id),
    auth: { Authorization: `Bearer ${String(login.body.accessToken)}` },
  };
}

describe('social routes', () => {
  it('requests, lists, accepts and removes a friendship using the session actor', async () => {
    const identity = createMemoryIdentityRepositories();
    const app = createApp({ config, identity });
    const alice = await createUser(app, 'socialalice');
    const bob = await createUser(app, 'socialbob');

    await request(app).post('/api/v1/friendships').send({ targetUserId: bob.id }).expect(401);
    const pending = await request(app)
      .post('/api/v1/friendships')
      .set(alice.auth)
      .set('Idempotency-Key', 'friend-request-1')
      .send({ targetUserId: bob.id })
      .expect(201);

    expect(pending.body).toMatchObject({ requesterId: alice.id, addresseeId: bob.id, status: 'pending' });
    const bobRequests = await request(app).get('/api/v1/friendships/requests').set(bob.auth).expect(200);
    expect(bobRequests.body.incoming).toEqual([expect.objectContaining({ id: pending.body.id, userId: alice.id })]);
    expect(bobRequests.body.outgoing).toEqual([]);
    await request(app).get(`/api/v1/relationships/${alice.id}`).set(bob.auth).expect(200, {
      state: 'pending-incoming',
      requestId: pending.body.id,
    });

    const accepted = await request(app)
      .post(`/api/v1/friendships/${String(pending.body.id)}/accept`)
      .set(bob.auth)
      .set('Idempotency-Key', 'friend-accept-1')
      .expect(200);
    expect(accepted.body.status).toBe('accepted');
    const replay = await request(app)
      .post(`/api/v1/friendships/${String(pending.body.id)}/accept`)
      .set(bob.auth)
      .set('Idempotency-Key', 'friend-accept-1')
      .expect(200);
    expect(replay.body).toEqual(accepted.body);

    const friends = await request(app).get('/api/v1/friendships').set(alice.auth).expect(200);
    expect(friends.body.items).toEqual([expect.objectContaining({ userId: bob.id, status: 'accepted' })]);
    await request(app).delete(`/api/v1/friendships/${bob.id}`).set(alice.auth).expect(204);
    await request(app).get(`/api/v1/relationships/${bob.id}`).set(alice.auth).expect(200, { state: 'none' });
  });

  it('rejects requests and rejects conflicting reuse of an idempotency key', async () => {
    const app = createApp({ config, identity: createMemoryIdentityRepositories() });
    const alice = await createUser(app, 'rejectalice');
    const bob = await createUser(app, 'rejectbob');
    const charlie = await createUser(app, 'rejectcharlie');
    const first = await request(app)
      .post('/api/v1/friendships')
      .set(alice.auth)
      .set('Idempotency-Key', 'request-key')
      .send({ targetUserId: bob.id })
      .expect(201);

    await request(app)
      .post('/api/v1/friendships')
      .set(alice.auth)
      .set('Idempotency-Key', 'request-key')
      .send({ targetUserId: charlie.id })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('IDEMPOTENCY_CONFLICT'));
    await request(app)
      .post(`/api/v1/friendships/${String(first.body.id)}/reject`)
      .set(bob.auth)
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('rejected'));
  });

  it('blocks mutually, hides relationship state behind a generic 404, and unblocks', async () => {
    const app = createApp({ config, identity: createMemoryIdentityRepositories() });
    const alice = await createUser(app, 'blockalice');
    const bob = await createUser(app, 'blockbob');

    await request(app).put(`/api/v1/blocks/${bob.id}`).set(alice.auth).expect(200);
    const blocks = await request(app).get('/api/v1/blocks').set(alice.auth).expect(200);
    expect(blocks.body.items).toEqual([expect.objectContaining({ userId: bob.id })]);
    await request(app)
      .get(`/api/v1/relationships/${alice.id}`)
      .set(bob.auth)
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('RESOURCE_NOT_FOUND'));
    await request(app)
      .post('/api/v1/friendships')
      .set(bob.auth)
      .send({ targetUserId: alice.id })
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('RESOURCE_NOT_FOUND'));
    await request(app).delete(`/api/v1/blocks/${bob.id}`).set(alice.auth).expect(204);
    await request(app).get(`/api/v1/relationships/${bob.id}`).set(alice.auth).expect(200, { state: 'none' });
  });
});
