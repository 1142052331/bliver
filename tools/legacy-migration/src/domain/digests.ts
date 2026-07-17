import { createHash } from 'node:crypto';

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

export function canonicalDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

export function tableDigest(rows: readonly unknown[]): string {
  return canonicalDigest([...rows].sort((left, right) => String((left as Record<string, unknown>)?.id ?? '').localeCompare(String((right as Record<string, unknown>)?.id ?? ''))));
}
