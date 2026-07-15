import { describe, expect, it, vi } from 'vitest';

import {
  MEDIA_MAX_BYTES,
  MediaError,
  MediaService,
  createMemoryMediaRepositories,
  type MediaAdapter,
} from '../index.js';

function createAdapter(): MediaAdapter {
  return {
    signUpload: vi.fn(async (input) => ({
      signature: 'signed-payload',
      timestamp: 1_700_000_000,
      apiKey: 'public-key',
      cloudName: 'test-cloud',
      publicId: input.publicId,
      version: null,
      width: null,
      height: null,
      format: 'jpg',
    })),
    deleteAsset: vi.fn(async () => undefined),
  };
}

describe('MediaService', () => {
  it('returns signed parameters and stable asset metadata without a URL', async () => {
    const adapter = createAdapter();
    const service = new MediaService({ adapter, repositories: createMemoryMediaRepositories() });

    const result = await service.requestSignature({
      actorId: 'actor-1',
      idempotencyKey: 'key-1',
      mimeType: 'image/jpeg',
      bytes: 2_048,
    });

    expect(result).toMatchObject({
      assetId: expect.any(String),
      publicId: expect.stringContaining('bliver/actor-1/'),
      signature: 'signed-payload',
      version: null,
      width: null,
      height: null,
      format: 'jpg',
    });
    expect(result).not.toHaveProperty('url');
    expect(result).not.toHaveProperty('signedUrl');
  });

  it('rejects unsupported MIME types before invoking the adapter', async () => {
    const adapter = createAdapter();
    const service = new MediaService({ adapter, repositories: createMemoryMediaRepositories() });

    await expect(service.requestSignature({ actorId: 'actor-1', idempotencyKey: 'key-1', mimeType: 'text/plain', bytes: 10 })).rejects.toMatchObject({ code: 'MEDIA_MIME_UNSUPPORTED' });
    expect(adapter.signUpload).not.toHaveBeenCalled();
  });

  it('rejects files larger than the configured maximum before invoking the adapter', async () => {
    const adapter = createAdapter();
    const service = new MediaService({ adapter, repositories: createMemoryMediaRepositories() });

    await expect(service.requestSignature({ actorId: 'actor-1', idempotencyKey: 'key-1', mimeType: 'image/jpeg', bytes: MEDIA_MAX_BYTES + 1 })).rejects.toMatchObject({ code: 'MEDIA_SIZE_INVALID' });
    expect(adapter.signUpload).not.toHaveBeenCalled();
  });

  it('reports missing provider configuration without exposing secrets', async () => {
    const service = new MediaService({ adapter: undefined, repositories: createMemoryMediaRepositories() });

    await expect(service.requestSignature({ actorId: 'actor-1', idempotencyKey: 'key-1', mimeType: 'image/jpeg', bytes: 10 })).rejects.toMatchObject({ code: 'MEDIA_CONFIGURATION_MISSING' });
    await expect(service.requestSignature({ actorId: 'actor-1', idempotencyKey: 'key-2', mimeType: 'image/jpeg', bytes: 10 })).rejects.not.toThrow(/secret|key/i);
  });

  it('replays the original result for an idempotency key and rejects conflicting reuse', async () => {
    const adapter = createAdapter();
    const service = new MediaService({ adapter, repositories: createMemoryMediaRepositories() });

    const first = await service.requestSignature({ actorId: 'actor-1', idempotencyKey: 'key-1', mimeType: 'image/jpeg', bytes: 10 });
    const replay = await service.requestSignature({ actorId: 'actor-1', idempotencyKey: 'key-1', mimeType: 'image/jpeg', bytes: 10 });
    expect(replay).toEqual(first);
    expect(adapter.signUpload).toHaveBeenCalledOnce();
    await expect(service.requestSignature({ actorId: 'actor-1', idempotencyKey: 'key-1', mimeType: 'image/png', bytes: 10 })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('allows only the asset owner to delete a signed asset', async () => {
    const adapter = createAdapter();
    const service = new MediaService({ adapter, repositories: createMemoryMediaRepositories() });
    const created = await service.requestSignature({ actorId: 'owner-1', idempotencyKey: 'key-1', mimeType: 'image/jpeg', bytes: 10 });

    await expect(service.deleteAsset({ actorId: 'other-1', assetId: created.assetId })).rejects.toMatchObject({ code: 'MEDIA_NOT_FOUND' });
    await service.deleteAsset({ actorId: 'owner-1', assetId: created.assetId });
    expect(adapter.deleteAsset).toHaveBeenCalledWith(created.publicId);
  });

  it('stores provider metadata only when the asset belongs to the actor', async () => {
    const repositories = createMemoryMediaRepositories();
    const service = new MediaService({ adapter: createAdapter(), repositories });
    const created = await service.requestSignature({ actorId: 'owner-1', idempotencyKey: 'key-complete', mimeType: 'image/jpeg', bytes: 10 });

    await expect(service.completeAsset({ actorId: 'other-1', assetId: created.assetId, version: 42, width: 1200, height: 900, format: 'jpg' })).rejects.toMatchObject({ code: 'MEDIA_NOT_FOUND' });
    await service.completeAsset({ actorId: 'owner-1', assetId: created.assetId, version: 42, width: 1200, height: 900, format: 'jpg' });

    await expect(repositories.assets.findById(created.assetId)).resolves.toMatchObject({
      version: 42,
      width: 1200,
      height: 900,
      format: 'jpg',
    });
  });

  it('keeps service errors typed for transport mapping', () => {
    expect(new MediaError('MEDIA_NOT_FOUND')).toBeInstanceOf(Error);
  });
});
