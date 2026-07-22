import { describe, expect, it } from 'vitest';

import { buildCloudinaryImagePreview } from '../cloudinary-delivery.js';

describe('Cloudinary delivery projection', () => {
  it('builds a delivery URL without accepting credentials', () => {
    expect(buildCloudinaryImagePreview('demo cloud', {
      publicId: 'bliver/user id/asset',
      version: 42,
      width: 1600,
      height: 1200,
      format: '.JPG',
    })).toEqual({
      url: 'https://res.cloudinary.com/demo%20cloud/image/upload/v42/bliver/user%20id/asset.jpg',
      width: 1600,
      height: 1200,
    });
  });

  it('fails closed when delivery configuration or completed metadata is missing', () => {
    const metadata = { publicId: 'bliver/asset', version: 42, width: 1600, height: 1200, format: 'jpg' };
    expect(buildCloudinaryImagePreview(undefined, metadata)).toBeNull();
    expect(buildCloudinaryImagePreview('demo', { ...metadata, width: 0 })).toBeNull();
    expect(buildCloudinaryImagePreview('demo', { ...metadata, publicId: 'bliver//asset' })).toBeNull();
  });
});
