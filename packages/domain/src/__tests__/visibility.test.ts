import { v4 } from 'uuid';
import { describe, expect, it } from 'vitest';

import {
  canDiscover,
  createConversationId,
  createEventId,
  createFootprintId,
  createUserId,
  isUuidV7,
  parseUserId,
} from '../index.js';

describe('discovery visibility', () => {
  const now = new Date('2026-07-15T00:00:00.000Z');
  const future = new Date('2026-07-15T00:01:00.000Z');
  const past = new Date('2026-07-14T23:59:00.000Z');

  it('allows unexpired public footprints', () => {
    expect(
      canDiscover({ visibility: 'public', discoveryExpiresAt: future }, now),
    ).toBe(true);
  });

  it('rejects expired public footprints', () => {
    expect(
      canDiscover({ visibility: 'public', discoveryExpiresAt: past }, now),
    ).toBe(false);
  });

  it('rejects non-public footprints', () => {
    expect(
      canDiscover({ visibility: 'private', discoveryExpiresAt: future }, now),
    ).toBe(false);
  });
});

describe('UUIDv7 identifiers', () => {
  it('generates UUIDv7 values for every public identifier type', () => {
    expect(
      [
        createUserId(),
        createFootprintId(),
        createConversationId(),
        createEventId(),
      ].every(isUuidV7),
    ).toBe(true);
  });

  it('rejects non-v7 UUIDs at the boundary', () => {
    expect(() => parseUserId(v4())).toThrow('UserId must be a UUIDv7');
  });
});
