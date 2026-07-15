import { createHash } from 'node:crypto';

import { MediaError, type MediaAdapter, type MediaSignedUpload, type MediaUploadInput } from '../../application/index.js';

export interface CloudinaryConfig {
  readonly cloudName: string;
  readonly apiKey: string;
  readonly apiSecret: string;
}

interface CloudinaryTransportResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

interface CloudinaryAdapterOptions {
  readonly now?: () => number;
  readonly fetch?: typeof fetch;
}

function signatureFor(parameters: Record<string, string | number>, apiSecret: string): string {
  const serialized = Object.entries(parameters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return createHash('sha1').update(`${serialized}${apiSecret}`).digest('hex');
}

function formatForMimeType(mimeType: string): string | null {
  const formats: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return formats[mimeType] ?? null;
}

export class CloudinaryAdapter implements MediaAdapter {
  private readonly config: CloudinaryConfig | undefined;
  private readonly now: () => number;
  private readonly fetcher: typeof fetch;

  constructor(config: CloudinaryConfig | undefined, options: CloudinaryAdapterOptions = {}) {
    this.config = config;
    this.now = options.now ?? (() => Math.floor(Date.now() / 1_000));
    this.fetcher = options.fetch ?? fetch;
  }

  async signUpload(input: MediaUploadInput): Promise<MediaSignedUpload> {
    const config = this.requireConfig();
    const timestamp = this.now();
    const allowedFormats = formatForMimeType(input.mimeType);
    const signature = signatureFor({ public_id: input.publicId, timestamp, allowed_formats: allowedFormats ?? '', max_file_size: input.bytes }, config.apiSecret);
    return {
      signature,
      timestamp,
      apiKey: config.apiKey,
      cloudName: config.cloudName,
      publicId: input.publicId,
      version: null,
      width: null,
      height: null,
      format: formatForMimeType(input.mimeType),
      allowedFormats: allowedFormats ?? '',
      maxFileBytes: input.bytes,
    };
  }

  async verifyAsset(publicId: string) {
    const config = this.requireConfig();
    let response: CloudinaryTransportResponse;
    try {
      response = await this.fetcher(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/resources/image/upload/${encodeURIComponent(publicId)}`, {
        headers: { authorization: `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64')}` },
      });
    } catch {
      return null;
    }
    if (!response.ok) return null;
    const body = await response.json() as { public_id?: unknown; version?: unknown; width?: unknown; height?: unknown; format?: unknown };
    if (body.public_id !== publicId || typeof body.version !== 'number' || typeof body.width !== 'number' || typeof body.height !== 'number' || !Number.isInteger(body.version) || !Number.isInteger(body.width) || !Number.isInteger(body.height) || typeof body.format !== 'string' || body.version <= 0 || body.width <= 0 || body.height <= 0 || !body.format) return null;
    return { publicId, version: body.version, width: body.width, height: body.height, format: body.format };
  }

  async deleteAsset(publicId: string): Promise<void> {
    const config = this.requireConfig();
    const timestamp = this.now();
    const signature = signatureFor({ public_id: publicId, timestamp }, config.apiSecret);
    const body = new URLSearchParams({
      public_id: publicId,
      timestamp: String(timestamp),
      api_key: config.apiKey,
      signature,
    });
    let response: CloudinaryTransportResponse;
    try {
      response = await this.fetcher(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/destroy`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch {
      throw new MediaError('MEDIA_DELETE_FAILED');
    }
    if (!response.ok) {
      throw new MediaError('MEDIA_DELETE_FAILED');
    }
  }

  private requireConfig(): CloudinaryConfig {
    if (!this.config?.cloudName || !this.config.apiKey || !this.config.apiSecret) {
      throw new MediaError('MEDIA_CONFIGURATION_MISSING');
    }
    return this.config;
  }
}

export function createCloudinaryAdapter(config: CloudinaryConfig | undefined, options?: CloudinaryAdapterOptions): CloudinaryAdapter {
  return new CloudinaryAdapter(config, options);
}
