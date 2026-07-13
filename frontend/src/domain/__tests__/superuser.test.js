import { describe, expect, test } from 'vitest';
import {
  SUPERUSER_NAME,
  canBypassFriendship,
  isSuperuser,
} from '../superuser';

describe('superuser presentation and authorization boundaries', () => {
  test('keeps founder display branding based on the legacy name', () => {
    expect(isSuperuser({ name: SUPERUSER_NAME })).toBe(true);
  });

  test('allows friendship bypass only for an admin role', () => {
    expect(canBypassFriendship({ name: SUPERUSER_NAME, role: 'user' })).toBe(false);
    expect(canBypassFriendship({ name: 'Founder Renamed', systemIdentity: 'asen', role: 'user' })).toBe(false);
    expect(canBypassFriendship({ name: 'moderator', role: 'admin' })).toBe(true);
  });
});
