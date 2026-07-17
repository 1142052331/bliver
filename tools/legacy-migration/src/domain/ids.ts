import { createHash } from 'node:crypto';

import { MigrationError } from './types.js';

export const LEGACY_NAMESPACE = '7290d9d2-4307-5ebf-a8fd-57483b403f67';
export const MIGRATION_DERIVED_EPOCH_MS = Date.UTC(2026, 6, 18);

export function canonicalObjectId(value: string): string {
  const normalized = value.toLowerCase();
  if (!/^[0-9a-f]{24}$/.test(normalized)) throw new MigrationError('INVALID_OBJECT_ID');
  return normalized;
}

export function legacyUuid(entity: string, key: string): string {
  const normalizedKey = key.toLowerCase();
  if (!entity || !normalizedKey) throw new MigrationError('UUID_KEY_REQUIRED');
  const timestamp = /^[0-9a-f]{24}$/.test(normalizedKey)
    ? Number.parseInt(normalizedKey.slice(0, 8), 16) * 1_000
    : MIGRATION_DERIVED_EPOCH_MS;
  const digest = createHash('sha256')
    .update(`${LEGACY_NAMESPACE}:${entity}:${normalizedKey}`)
    .digest();
  const bytes = Buffer.alloc(16);
  let remaining = BigInt(timestamp);
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  bytes[6] = 0x70 | (digest[0]! & 0x0f);
  bytes[7] = digest[1]!;
  bytes[8] = 0x80 | (digest[2]! & 0x3f);
  digest.copy(bytes, 9, 3, 10);
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class DeterministicIdRegistry {
  private readonly sourcesByTarget = new Map<string, string>();

  constructor(private readonly generate: (entity: string, key: string) => string = legacyUuid) {}

  id(entity: string, key: string): string {
    const source = `${entity.toLowerCase()}:${key.toLowerCase()}`;
    const target = this.generate(entity, key);
    const prior = this.sourcesByTarget.get(target);
    if (prior && prior !== source) throw new MigrationError('UUID_COLLISION');
    this.sourcesByTarget.set(target, source);
    return target;
  }
}
