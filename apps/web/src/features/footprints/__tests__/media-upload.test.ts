import { afterEach, describe, expect, it, vi } from 'vitest';

import { uploadMedia } from '../media-upload.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadMedia', () => {
  it('completes stored metadata after Cloudinary accepts the direct upload', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        assetId: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b70',
        cloudName: 'test-cloud',
        apiKey: 'public-key',
        timestamp: 1_700_000_000,
        signature: 'signed',
        publicId: 'bliver/owner/asset',
        version: null,
        width: null,
        height: null,
        format: 'jpg',
        allowedFormats: 'jpg',
        maxFileBytes: 10,
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        public_id: 'bliver/owner/asset',
        version: 42,
        width: 1200,
        height: 900,
        format: 'jpg',
        allowedFormats: 'jpg',
        maxFileBytes: 10,
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadMedia(new File(['image'], 'photo.jpg', { type: 'image/jpeg' }));

    expect(result).toEqual({ assetId: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b70' });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/v1/media/019c2f52-3e9b-7d1f-8d68-cf35d75d9b70/complete', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ publicId: 'bliver/owner/asset', version: 42, width: 1200, height: 900, format: 'jpg' }),
    }));
  });

  it('rejects invalid Cloudinary metadata before calling the completion endpoint', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        assetId: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b70',
        cloudName: 'test-cloud',
        apiKey: 'public-key',
        timestamp: 1_700_000_000,
        signature: 'signed',
        publicId: 'bliver/owner/asset',
        version: null,
        width: null,
        height: null,
        format: 'jpg',
        allowedFormats: 'jpg',
        maxFileBytes: 10,
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        public_id: 'bliver/owner/asset',
        version: 42,
        width: -1,
        height: 900,
        format: 'jpg',
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadMedia(new File(['image'], 'photo.jpg', { type: 'image/jpeg' }))).rejects.toThrow('Invalid Cloudinary upload response');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
