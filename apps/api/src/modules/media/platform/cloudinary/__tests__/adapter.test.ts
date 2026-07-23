import { describe, expect, it, vi } from 'vitest';

import { CloudinaryAdapter } from '../adapter.js';

describe('CloudinaryAdapter', () => {
  it('creates short-lived signed upload parameters without returning a signed URL or secret', async () => {
    const adapter = new CloudinaryAdapter(
      { cloudName: 'demo', apiKey: 'public-key', apiSecret: 'private-secret' },
      { now: () => 1_700_000_000 },
    );

    const result = await adapter.signUpload({
      publicId: 'bliver/asset-1',
      mimeType: 'image/jpeg',
      bytes: 100,
    });

    expect(result).toMatchObject({
      apiKey: 'public-key',
      cloudName: 'demo',
      publicId: 'bliver/asset-1',
      timestamp: 1_700_000_000,
      signature: expect.stringMatching(/^[a-f0-9]{40}$/),
      allowedFormats: 'jpg',
      maxFileBytes: 100,
    });
    expect(result).not.toHaveProperty('apiSecret');
    expect(result).not.toHaveProperty('url');
    expect(result).not.toHaveProperty('signedUrl');
  });

  it('omits provider-managed max file size from the Cloudinary signature', async () => {
    const adapter = new CloudinaryAdapter(
      { cloudName: 'demo', apiKey: 'public-key', apiSecret: 'private-secret' },
      { now: () => 1_700_000_000 },
    );

    await expect(adapter.signUpload({
      publicId: 'bliver/asset-1',
      mimeType: 'image/jpeg',
      bytes: 100,
    })).resolves.toMatchObject({ signature: 'af7d80f4f707d6c99f83b00a74d6c1de1bd3330e' });
  });

  it('verifies provider metadata for the signed public ID', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ public_id: 'bliver/asset-1', version: 42, width: 1200, height: 900, format: 'jpg' }), { status: 200 }));
    const adapter = new CloudinaryAdapter({ cloudName: 'demo', apiKey: 'public-key', apiSecret: 'private-secret' }, { fetch: fetcher });

    await expect(adapter.verifyAsset('bliver/asset-1')).resolves.toEqual({ publicId: 'bliver/asset-1', version: 42, width: 1200, height: 900, format: 'jpg' });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/resources/image/upload/'), expect.objectContaining({ headers: expect.objectContaining({ authorization: expect.stringMatching(/^Basic /) }) }));
  });

  it('rejects missing configuration before signing', async () => {
    const adapter = new CloudinaryAdapter(undefined);

    await expect(adapter.signUpload({ publicId: 'bliver/asset-1', mimeType: 'image/jpeg', bytes: 100 })).rejects.toMatchObject({ code: 'MEDIA_CONFIGURATION_MISSING' });
  });

  it('reports provider failures through the runtime dependency observer', async () => {
    const observe = vi.fn();
    const adapter = new CloudinaryAdapter(
      { cloudName: 'demo', apiKey: 'public-key', apiSecret: 'private-secret' },
      { fetch: vi.fn(async () => { throw new Error('offline'); }), observe },
    );

    await expect(adapter.verifyAsset('bliver/asset-1')).resolves.toBeNull();
    expect(observe).toHaveBeenCalledWith(false);
  });
});
