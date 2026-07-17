import { v5 } from 'uuid';

import { MigrationError } from './types.js';

export const LEGACY_NAMESPACE = '7290d9d2-4307-5ebf-a8fd-57483b403f67';

export function canonicalObjectId(value: string): string {
  const normalized = value.toLowerCase();
  if (!/^[0-9a-f]{24}$/.test(normalized)) throw new MigrationError('INVALID_OBJECT_ID');
  return normalized;
}

export function legacyUuid(entity: string, key: string): string {
  return v5(`${entity}:${key.toLowerCase()}`, LEGACY_NAMESPACE);
}
