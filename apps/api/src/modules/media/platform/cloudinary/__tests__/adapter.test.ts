import { describe, expect, it } from 'vitest';

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
    });
    expect(result).not.toHaveProperty('apiSecret');
    expect(result).not.toHaveProperty('url');
    expect(result).not.toHaveProperty('signedUrl');
  });

  it('rejects missing configuration before signing', async () => {
    const adapter = new CloudinaryAdapter(undefined);

    await expect(adapter.signUpload({ publicId: 'bliver/asset-1', mimeType: 'image/jpeg', bytes: 100 })).rejects.toMatchObject({ code: 'MEDIA_CONFIGURATION_MISSING' });
  });
});
