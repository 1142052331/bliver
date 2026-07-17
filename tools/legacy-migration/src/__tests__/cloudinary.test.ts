import { describe, expect, it } from 'vitest';

import { verifyCloudinaryImage } from '../adapters/cloudinary.js';

describe('read-only Cloudinary inventory', () => {
  it('parses the expected cloud and returns complete provider metadata', async () => {
    const calls: string[] = [];
    const result = await verifyCloudinaryImage(
      'https://res.cloudinary.com/bliver/image/upload/v7/legacy/photo.jpg',
      'bliver',
      { async resource(publicId) { calls.push(publicId); return { publicId, mimeType: 'image/jpeg', bytes: 1024, version: 7, width: 800, height: 600, format: 'jpg' }; } },
    );
    expect(calls).toEqual(['legacy/photo']);
    expect(result).toMatchObject({ publicId: 'legacy/photo', bytes: 1024, version: 7, format: 'jpg' });
  });

  it('blocks cloud mismatches and incomplete metadata without a placeholder', async () => {
    const port = { async resource(publicId: string) { return { publicId, mimeType: 'image/jpeg', bytes: 0, version: 7, width: 0, height: 600, format: 'jpg' }; } };
    await expect(verifyCloudinaryImage('https://res.cloudinary.com/other/image/upload/v7/photo.jpg', 'bliver', port))
      .rejects.toThrow('MEDIA_CLOUD_MISMATCH');
    await expect(verifyCloudinaryImage('https://res.cloudinary.com/bliver/image/upload/v7/photo.jpg', 'bliver', port))
      .rejects.toThrow('MEDIA_METADATA_INCOMPLETE');
  });
});
