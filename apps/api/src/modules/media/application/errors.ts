export type MediaErrorCode =
  | 'MEDIA_MIME_UNSUPPORTED'
  | 'MEDIA_SIZE_INVALID'
  | 'MEDIA_CONFIGURATION_MISSING'
  | 'MEDIA_NOT_FOUND'
  | 'MEDIA_DELETE_FAILED'
  | 'IDEMPOTENCY_CONFLICT';

export class MediaError extends Error {
  constructor(readonly code: MediaErrorCode) {
    super(code);
    this.name = 'MediaError';
  }
}
