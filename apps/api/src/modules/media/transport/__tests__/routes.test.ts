import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createConfig } from '../../../../bootstrap/config.js';
import { createApp } from '../../../../http/app.js';
import { createMemoryIdentityRepositories } from '../../../identity/application/memory-repositories.js';
import {
  createMemoryMediaRepositories,
  MediaService,
  type MediaAdapter,
} from '../../application/index.js';

const config = createConfig({
  NODE_ENV: 'test',
  DEPLOY_ENV: 'test',
  RELEASE_SHA: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  SESSION_SECRET: 'test-session-secret-that-is-long-enough-1234',
});

function createAdapter(): MediaAdapter {
  return {
    signUpload: vi.fn(async (input) => ({
      signature: 'signature',
      timestamp: 1_700_000_000,
      apiKey: 'public-key',
      cloudName: 'cloud',
      publicId: input.publicId,
      version: null,
      width: null,
      height: null,
      format: 'jpg',
      allowedFormats: 'jpg',
      maxFileBytes: input.bytes,
    })),
    verifyAsset: vi.fn(async (publicId) => ({ publicId, version: 42, width: 1200, height: 900, format: 'jpg' })),
    deleteAsset: vi.fn(async () => undefined),
  };
}

async function registerAndGetBearer(app: ReturnType<typeof createApp>, username: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ username, password: 'password-123' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ username, password: 'password-123', platform: 'capacitor' }).expect(200);
  return login.body.accessToken as string;
}

describe('media REST transport', () => {
  it('requires authentication and returns only signed upload parameters', async () => {
    const identity = createMemoryIdentityRepositories();
    const service = new MediaService({ adapter: createAdapter(), repositories: createMemoryMediaRepositories() });
    const app = createApp({ config, identity, media: service });

    await request(app).post('/api/v1/media/signature').set('idempotency-key', 'key-1').send({ mimeType: 'image/jpeg', bytes: 10 }).expect(401);
    const token = await registerAndGetBearer(app, 'mediaowner');
    const response = await request(app)
      .post('/api/v1/media/signature')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'key-1')
      .send({ mimeType: 'image/jpeg', bytes: 10 })
      .expect(200);

    expect(response.body).toMatchObject({ signature: 'signature', publicId: expect.any(String), assetId: expect.any(String) });
    expect(response.body).not.toHaveProperty('signedUrl');
    expect(response.body).not.toHaveProperty('apiSecret');
  });

  it('returns Problem Details for invalid MIME and conflicting idempotency reuse', async () => {
    const identity = createMemoryIdentityRepositories();
    const service = new MediaService({ adapter: createAdapter(), repositories: createMemoryMediaRepositories() });
    const app = createApp({ config, identity, media: service });
    const token = await registerAndGetBearer(app, 'mediainvalid');

    const invalid = await request(app)
      .post('/api/v1/media/signature')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'key-1')
      .send({ mimeType: 'text/plain', bytes: 10 });
    expect(invalid.status).toBe(400);
    expect(invalid.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(invalid.body.code).toBe('MEDIA_MIME_UNSUPPORTED');

    await request(app)
      .post('/api/v1/media/signature')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'key-2')
      .send({ mimeType: 'image/jpeg', bytes: 10 })
      .expect(200);
    const conflict = await request(app)
      .post('/api/v1/media/signature')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'key-2')
      .send({ mimeType: 'image/png', bytes: 10 });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('prevents a different actor from deleting an owned asset', async () => {
    const identity = createMemoryIdentityRepositories();
    const adapter = createAdapter();
    const service = new MediaService({ adapter, repositories: createMemoryMediaRepositories() });
    const app = createApp({ config, identity, media: service });
    const owner = await registerAndGetBearer(app, 'mediaownertwo');
    const other = await registerAndGetBearer(app, 'mediaother');
    const signature = await request(app)
      .post('/api/v1/media/signature')
      .set('Authorization', `Bearer ${owner}`)
      .set('Idempotency-Key', 'key-delete')
      .send({ mimeType: 'image/jpeg', bytes: 10 })
      .expect(200);

    await request(app)
      .delete(`/api/v1/media/${signature.body.assetId}`)
      .set('Authorization', `Bearer ${other}`)
      .expect(404);
    await request(app)
      .delete(`/api/v1/media/${signature.body.assetId}`)
      .set('Authorization', `Bearer ${owner}`)
      .expect(204);
    expect(adapter.deleteAsset).toHaveBeenCalledWith(signature.body.publicId);
  });

  it('requires the owner to complete uploaded asset metadata', async () => {
    const identity = createMemoryIdentityRepositories();
    const repositories = createMemoryMediaRepositories();
    const service = new MediaService({ adapter: createAdapter(), repositories });
    const app = createApp({ config, identity, media: service });
    const owner = await registerAndGetBearer(app, 'mediacompleteowner');
    const other = await registerAndGetBearer(app, 'mediacompleteother');
    const signature = await request(app)
      .post('/api/v1/media/signature')
      .set('Authorization', `Bearer ${owner}`)
      .set('Idempotency-Key', 'key-complete')
      .send({ mimeType: 'image/jpeg', bytes: 10 })
      .expect(200);
    const endpoint = `/api/v1/media/${signature.body.assetId}/complete`;

    await request(app).post(endpoint).send({ publicId: signature.body.publicId, version: 42, width: 1200, height: 900, format: 'jpg' }).expect(401);
    await request(app).post(endpoint).set('Authorization', `Bearer ${other}`).send({ publicId: signature.body.publicId, version: 42, width: 1200, height: 900, format: 'jpg' }).expect(404);
    await request(app).post(endpoint).set('Authorization', `Bearer ${owner}`).send({ publicId: signature.body.publicId, version: 42, width: 1200, height: 900, format: 'jpg' }).expect(204);

    await expect(repositories.assets.findById(signature.body.assetId)).resolves.toMatchObject({ version: 42, width: 1200, height: 900, format: 'jpg' });
  });
});
