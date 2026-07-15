import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { publishFootprintResponse } from '@bliver/contracts';
import { createConfig } from '../../../../bootstrap/config.js';
import { createApp } from '../../../../http/app.js';
import { createMemoryIdentityRepositories } from '../../../identity/application/memory-repositories.js';

const config = createConfig({
  NODE_ENV: 'test',
  DEPLOY_ENV: 'test',
  RELEASE_SHA: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  SESSION_SECRET: 'test-session-secret-that-is-long-enough-1234',
});

describe('footprint REST transport', () => {
  it('returns the wrapped publish response declared by the contracts', async () => {
    const app = createApp({ config, identity: createMemoryIdentityRepositories() });
    await request(app).post('/api/v1/auth/register').send({ username: 'publishcontract', password: 'password-123' }).expect(201);
    const login = await request(app).post('/api/v1/auth/login').send({ username: 'publishcontract', password: 'password-123', platform: 'capacitor' }).expect(200);
    const response = await request(app)
      .post('/api/v1/footprints')
      .set('Authorization', `Bearer ${login.body.accessToken as string}`)
      .set('Idempotency-Key', 'publish-contract')
      .send({ message: 'Contract response', privatePoint: { lat: 31.23, lng: 121.47 }, visibility: 'public', locationPrecision: 'approximate', mediaAssetIds: [] })
      .expect(201);

    expect(publishFootprintResponse.safeParse(response.body).success).toBe(true);
    expect(response.body).toHaveProperty('footprint');
    expect(response.body).toHaveProperty('event');
  });

  it('rejects media IDs that do not satisfy the shared UUID contract', async () => {
    const app = createApp({ config, identity: createMemoryIdentityRepositories() });
    await request(app).post('/api/v1/auth/register').send({ username: 'publishinvalidasset', password: 'password-123' }).expect(201);
    const login = await request(app).post('/api/v1/auth/login').send({ username: 'publishinvalidasset', password: 'password-123', platform: 'capacitor' }).expect(200);

    await request(app)
      .post('/api/v1/footprints')
      .set('Authorization', `Bearer ${login.body.accessToken as string}`)
      .set('Idempotency-Key', 'publish-invalid-asset')
      .send({ message: 'Invalid asset', privatePoint: { lat: 31.23, lng: 121.47 }, visibility: 'public', locationPrecision: 'approximate', mediaAssetIds: ['not-a-uuid'] })
      .expect(400);
  });
});
