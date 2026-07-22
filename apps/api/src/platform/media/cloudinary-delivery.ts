export interface CloudinaryImageMetadata {
  readonly publicId: string;
  readonly version: number;
  readonly width: number;
  readonly height: number;
  readonly format: string;
}

export interface CloudinaryImagePreview {
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

export function buildCloudinaryImagePreview(
  cloudName: string | undefined,
  metadata: CloudinaryImageMetadata,
): CloudinaryImagePreview | null {
  const cloud = cloudName?.trim();
  const segments = metadata.publicId.split('/');
  const format = metadata.format.trim().replace(/^\./, '').toLowerCase();
  if (
    !cloud ||
    segments.some((segment) => !segment) ||
    !Number.isSafeInteger(metadata.version) ||
    metadata.version <= 0 ||
    !Number.isSafeInteger(metadata.width) ||
    metadata.width <= 0 ||
    !Number.isSafeInteger(metadata.height) ||
    metadata.height <= 0 ||
    !/^[a-z0-9]+$/.test(format)
  ) {
    return null;
  }

  const publicId = segments.map((segment) => encodeURIComponent(segment)).join('/');
  const url = `https://res.cloudinary.com/${encodeURIComponent(cloud)}/image/upload/v${metadata.version}/${publicId}.${format}`;
  return { url, width: metadata.width, height: metadata.height };
}
