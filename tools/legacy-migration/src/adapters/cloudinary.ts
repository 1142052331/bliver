import { MigrationError } from '../domain/types.js';

export interface VerifiedMedia {
  readonly publicId: string;
  readonly mimeType: string;
  readonly bytes: number;
  readonly version: number;
  readonly width: number;
  readonly height: number;
  readonly format: string;
}

export interface CloudinaryMetadataPort {
  resource(publicId: string): Promise<VerifiedMedia | null>;
}

function publicIdFromUrl(rawUrl: string, expectedCloud: string): string {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new MigrationError('MEDIA_URL_INVALID'); }
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || parts[0] !== expectedCloud) throw new MigrationError('MEDIA_CLOUD_MISMATCH');
  if (parts[1] !== 'image' || parts[2] !== 'upload') throw new MigrationError('MEDIA_TYPE_UNSUPPORTED');
  const assetParts = parts.slice(3);
  if (/^v\d+$/.test(assetParts[0] ?? '')) assetParts.shift();
  const filename = assetParts.pop();
  if (!filename?.includes('.')) throw new MigrationError('MEDIA_URL_INVALID');
  assetParts.push(filename.slice(0, filename.lastIndexOf('.')));
  return assetParts.join('/');
}

export async function verifyCloudinaryImage(rawUrl: string, expectedCloud: string, port: CloudinaryMetadataPort): Promise<VerifiedMedia> {
  const publicId = publicIdFromUrl(rawUrl, expectedCloud);
  const metadata = await port.resource(publicId);
  if (!metadata || metadata.publicId !== publicId || !metadata.mimeType.startsWith('image/') || metadata.bytes <= 0 || metadata.version <= 0 || metadata.width <= 0 || metadata.height <= 0 || !metadata.format) {
    throw new MigrationError('MEDIA_METADATA_INCOMPLETE');
  }
  return metadata;
}
