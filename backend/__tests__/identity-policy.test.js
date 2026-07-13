const User = require('../models/User');
const {
  FOUNDER_SYSTEM_IDENTITY,
  isFounder,
  isReservedName,
  assertNameClaimAllowed,
} = require('../services/UserIdentityPolicy');
const { SUPERUSER_NAME } = require('../services/superuser');

describe('UserIdentityPolicy', () => {
  test('recognizes founder identity only from systemIdentity', () => {
    expect(isFounder({ name: SUPERUSER_NAME, role: 'user' })).toBe(false);
    expect(isFounder({ name: 'Founder Renamed', systemIdentity: FOUNDER_SYSTEM_IDENTITY })).toBe(true);
  });

  test('recognizes the reserved name after trimming', () => {
    expect(isReservedName(`  ${SUPERUSER_NAME}  `)).toBe(true);
    expect(isReservedName('different-name')).toBe(false);
  });

  test('rejects reserved claims for ordinary users with a conflict error', () => {
    expect(() => assertNameClaimAllowed(SUPERUSER_NAME, { role: 'user' }))
      .toThrow(expect.objectContaining({ statusCode: 409 }));
    expect(() => assertNameClaimAllowed(SUPERUSER_NAME, {
      role: 'user',
      systemIdentity: FOUNDER_SYSTEM_IDENTITY,
    })).not.toThrow();
  });

  test('keeps the User system identity index unique and sparse', () => {
    const identityIndex = User.schema.indexes().find(([key]) => key.systemIdentity === 1);

    expect(identityIndex).toEqual([
      { systemIdentity: 1 },
      { unique: true, sparse: true },
    ]);
  });
});
