export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const MEDIA_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

export type MediaMimeType = (typeof MEDIA_MIME_TYPES)[number];

export interface MediaUploadInput {
  readonly publicId: string;
  readonly mimeType: string;
  readonly bytes: number;
}

export interface MediaSignedUpload {
  readonly signature: string;
  readonly timestamp: number;
  readonly apiKey: string;
  readonly cloudName: string;
  readonly publicId: string;
  readonly version: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly format: string | null;
  readonly allowedFormats: string;
  readonly maxFileBytes: number;
}

export interface MediaProviderAsset {
  readonly publicId: string;
  readonly version: number;
  readonly width: number;
  readonly height: number;
  readonly format: string;
}

export interface MediaAdapter {
  signUpload(input: MediaUploadInput): Promise<MediaSignedUpload>;
  verifyAsset(publicId: string): Promise<MediaProviderAsset | null>;
  deleteAsset(publicId: string): Promise<void>;
}

export interface MediaAsset {
  readonly assetId: string;
  readonly ownerId: string;
  readonly publicId: string;
  readonly mimeType: MediaMimeType;
  readonly bytes: number;
  readonly version: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly format: string | null;
  readonly createdAt: Date;
}

export interface MediaSignatureResult extends MediaSignedUpload {
  readonly assetId: string;
}

export interface MediaIdempotencyRecord {
  readonly actorId: string;
  readonly key: string;
  readonly fingerprint: string;
  readonly result: MediaSignatureResult;
}

export interface MediaAssetRepository {
  findById(assetId: string): Promise<MediaAsset | null>;
  create(asset: MediaAsset): Promise<void>;
  updateMetadata(assetId: string, metadata: Pick<MediaAsset, 'version' | 'width' | 'height' | 'format'>): Promise<void>;
  delete(assetId: string): Promise<void>;
}

export interface MediaIdempotencyRepository {
  find(actorId: string, key: string): Promise<MediaIdempotencyRecord | null>;
  save(record: MediaIdempotencyRecord): Promise<void>;
}

export interface MediaRepositories {
  readonly assets: MediaAssetRepository;
  readonly idempotency: MediaIdempotencyRepository;
  readonly transactions?: MediaTransactionPort;
}

export interface MediaTransactionPort { commitSignature(input: { readonly asset: MediaAsset; readonly actorId: string; readonly key: string; readonly fingerprint: string; readonly result: MediaSignatureResult }): Promise<MediaSignatureResult>; }

export type MediaClock = () => number;
