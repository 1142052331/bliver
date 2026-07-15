import { createEventId } from '@bliver/domain';

import {
  MEDIA_MAX_BYTES,
  MEDIA_MIME_TYPES,
  type MediaAdapter,
  type MediaAsset,
  type MediaMimeType,
  type MediaRepositories,
  type MediaSignatureResult,
} from './ports.js';
import { MediaError } from './errors.js';

const formatByMimeType: Record<MediaMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function fingerprint(input: { mimeType: string; bytes: number }): string {
  return `${input.mimeType.toLowerCase()}:${input.bytes}`;
}

export interface RequestSignatureInput {
  readonly actorId: string;
  readonly idempotencyKey: string;
  readonly mimeType: string;
  readonly bytes: number;
}

export interface DeleteAssetInput {
  readonly actorId: string;
  readonly assetId: string;
}

export interface CompleteAssetInput extends DeleteAssetInput {
  readonly version: number;
  readonly width: number;
  readonly height: number;
  readonly format: string;
}

export interface MediaServiceOptions {
  readonly adapter: MediaAdapter | undefined;
  readonly repositories: MediaRepositories;
  readonly clock?: () => Date;
}

export class MediaService {
  private readonly adapter: MediaAdapter | undefined;
  private readonly repositories: MediaRepositories;
  private readonly clock: () => Date;

  constructor(options: MediaServiceOptions) {
    this.adapter = options.adapter;
    this.repositories = options.repositories;
    this.clock = options.clock ?? (() => new Date());
  }

  async requestSignature(input: RequestSignatureInput): Promise<MediaSignatureResult> {
    const mimeType = input.mimeType.trim().toLowerCase();
    if (!MEDIA_MIME_TYPES.includes(mimeType as MediaMimeType)) {
      throw new MediaError('MEDIA_MIME_UNSUPPORTED');
    }
    if (!Number.isSafeInteger(input.bytes) || input.bytes <= 0 || input.bytes > MEDIA_MAX_BYTES) {
      throw new MediaError('MEDIA_SIZE_INVALID');
    }
    const key = input.idempotencyKey.trim();
    if (!key) {
      throw new MediaError('IDEMPOTENCY_CONFLICT');
    }

    const requestFingerprint = fingerprint({ mimeType, bytes: input.bytes });
    const existing = await this.repositories.idempotency.find(input.actorId, key);
    if (existing) {
      if (existing.fingerprint !== requestFingerprint) {
        throw new MediaError('IDEMPOTENCY_CONFLICT');
      }
      return existing.result;
    }

    if (!this.adapter) {
      throw new MediaError('MEDIA_CONFIGURATION_MISSING');
    }

    const assetId = createEventId();
    const publicId = `bliver/${input.actorId}/${assetId}`;
    const signed = await this.adapter.signUpload({ publicId, mimeType, bytes: input.bytes });
    const result: MediaSignatureResult = { assetId, ...signed, format: signed.format ?? formatByMimeType[mimeType as MediaMimeType] };
    const asset: MediaAsset = {
      assetId,
      ownerId: input.actorId,
      publicId: signed.publicId,
      mimeType: mimeType as MediaMimeType,
      bytes: input.bytes,
      version: signed.version,
      width: signed.width,
      height: signed.height,
      format: result.format,
      createdAt: this.clock(),
    };
    if (this.repositories.transactions) await this.repositories.transactions.commitSignature({ asset, actorId: input.actorId, key, fingerprint: requestFingerprint, result });
    else { await this.repositories.assets.create(asset); await this.repositories.idempotency.save({ actorId: input.actorId, key, fingerprint: requestFingerprint, result }); }
    return result;
  }

  async deleteAsset(input: DeleteAssetInput): Promise<void> {
    const asset = await this.repositories.assets.findById(input.assetId);
    if (!asset || asset.ownerId !== input.actorId) {
      throw new MediaError('MEDIA_NOT_FOUND');
    }
    if (!this.adapter) {
      throw new MediaError('MEDIA_CONFIGURATION_MISSING');
    }
    await this.adapter.deleteAsset(asset.publicId);
    await this.repositories.assets.delete(asset.assetId);
  }

  async completeAsset(input: CompleteAssetInput): Promise<void> {
    const asset = await this.repositories.assets.findById(input.assetId);
    if (!asset || asset.ownerId !== input.actorId) {
      throw new MediaError('MEDIA_NOT_FOUND');
    }
    await this.repositories.assets.updateMetadata(asset.assetId, {
      version: input.version,
      width: input.width,
      height: input.height,
      format: input.format,
    });
  }
}
