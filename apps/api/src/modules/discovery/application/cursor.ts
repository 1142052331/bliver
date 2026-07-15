import { createHmac, timingSafeEqual } from 'node:crypto';

export interface DiscoveryCursor {
  readonly publishedAt: string;
  readonly id: string;
}

const MAX_CURSOR_LENGTH = 512;

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function encodeDiscoveryCursor(value: DiscoveryCursor, secret = process.env.SESSION_SECRET ?? 'bliver-discovery-cursor'): string {
  const payload = Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return `${payload}.${signature(payload, secret)}`;
}

export function decodeDiscoveryCursor(value: string | undefined, secret = process.env.SESSION_SECRET ?? 'bliver-discovery-cursor'): DiscoveryCursor | null {
  if (!value || value.length > MAX_CURSOR_LENGTH) return null;
  const [payload, provided] = value.split('.');
  if (!payload || !provided || provided.length > 128) return null;
  const expected = signature(payload, secret);
  const actualBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (typeof parsed.publishedAt !== 'string' || typeof parsed.id !== 'string' || parsed.id.length > 64) return null;
    const publishedAt = new Date(parsed.publishedAt);
    return Number.isNaN(publishedAt.getTime()) ? null : { publishedAt: publishedAt.toISOString(), id: parsed.id };
  } catch {
    return null;
  }
}

export { MAX_CURSOR_LENGTH };
