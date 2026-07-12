const mongoose = require('mongoose');
const { normalizeActivityQuery } = require('../validators/activityQuery');
const {
  encodeActivityCursor,
  decodeActivityCursor,
  buildCursorFilter,
} = require('../services/ActivityCursor');

const CREATED_AT = new Date('2026-07-12T03:04:05.678Z');
const ID = '64b000000000000000000123';

function rawCursor(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

describe('normalizeActivityQuery', () => {
  test('applies smart scope and bounded page-size defaults', () => {
    expect(normalizeActivityQuery({})).toEqual({ scope: 'smart', limit: 20 });
  });

  test('normalizes fixed region context and numeric query-string limits', () => {
    expect(normalizeActivityQuery({
      scope: 'region',
      countryCode: ' cn ',
      regionCode: ' cn-sh ',
      limit: '25',
    })).toEqual({
      scope: 'region',
      countryCode: 'CN',
      regionCode: 'CN-SH',
      limit: 25,
    });
  });

  test('accepts optional normalized context for smart scope', () => {
    expect(normalizeActivityQuery({ countryCode: ' jp ', regionCode: ' jp-13 ' }))
      .toEqual({ scope: 'smart', countryCode: 'JP', regionCode: 'JP-13', limit: 20 });
  });

  test('accepts a valid opaque cursor without exposing its payload', () => {
    const cursor = encodeActivityCursor({ createdAt: CREATED_AT, _id: ID });

    expect(normalizeActivityQuery({ cursor })).toEqual({ scope: 'smart', limit: 20, cursor });
  });

  test.each([
    [{ scope: 'region', countryCode: 'CN' }],
    [{ scope: 'region', regionCode: 'CN-SH' }],
    [{ scope: 'country' }],
    [{ scope: 'country', countryCode: 'CN', regionCode: 'CN-SH' }],
    [{ scope: 'global', countryCode: 'CN' }],
    [{ scope: 'global', regionCode: 'CN-SH' }],
  ])('rejects incomplete or contradictory fixed geography %#', (input) => {
    expect(() => normalizeActivityQuery(input)).toThrow('Invalid activity query');
  });

  test.each([
    { scope: 'nearby' },
    { countryCode: '' },
    { regionCode: 'x'.repeat(41) },
    { limit: 0 },
    { limit: -1 },
    { limit: 1.5 },
    { limit: 51 },
    { limit: Number.NaN },
    { limit: ['20'] },
    { limit: 'twenty' },
    { cursor: 'not+base64url' },
    { cursor: 'a'.repeat(257) },
  ])('rejects invalid query values %#', (input) => {
    expect(() => normalizeActivityQuery(input)).toThrow('Invalid activity query');
  });

  test('rejects unknown and prototype-shaped input without polluting objects', () => {
    const input = JSON.parse('{"scope":"smart","__proto__":{"polluted":true}}');

    expect(() => normalizeActivityQuery(input)).toThrow('Invalid activity query');
    expect({}.polluted).toBeUndefined();
  });
});

describe('ActivityCursor', () => {
  test.each([
    '000000000000000000000000',
    ID,
    'ffffffffffffffffffffffff',
  ])('round-trips exact UTC time and ObjectId %s', (id) => {
    const cursor = encodeActivityCursor({ createdAt: CREATED_AT, _id: id });
    const decoded = decodeActivityCursor(cursor);

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(cursor).not.toContain(id);
    expect(decoded.version).toBe(1);
    expect(decoded.createdAt).toEqual(CREATED_AT);
    expect(decoded._id).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(decoded._id.toString()).toBe(id);
    expect(encodeActivityCursor(decoded)).toBe(cursor);
  });

  test.each([
    ['', 'empty'],
    ['not+base64url', 'alphabet'],
    ['高知', 'unicode'],
    ['a'.repeat(257), 'oversized'],
    [Buffer.from('{', 'utf8').toString('base64url'), 'invalid JSON'],
    [rawCursor(null), 'null payload'],
    [rawCursor({ v: 2, t: CREATED_AT.toISOString(), i: ID }), 'unknown version'],
    [rawCursor({ v: 1, t: 'yesterday', i: ID }), 'invalid date'],
    [rawCursor({ v: 1, t: '2026-07-12T03:04:05Z', i: ID }), 'non-canonical date'],
    [rawCursor({ v: 1, t: CREATED_AT.toISOString(), i: 'not-an-id' }), 'invalid ObjectId'],
    [rawCursor({ v: '1', t: CREATED_AT.toISOString(), i: ID }), 'wrong field type'],
    [rawCursor({ v: 1, t: CREATED_AT.toISOString(), i: ID, extra: true }), 'extra field'],
    [`${rawCursor({ v: 1, t: CREATED_AT.toISOString(), i: ID })}=`, 'non-canonical base64'],
  ])('rejects malformed cursors: %s (%s)', (cursor) => {
    expect(() => decodeActivityCursor(cursor)).toThrow('Invalid activity cursor');
  });

  test('rejects prototype-shaped cursor payloads', () => {
    const cursor = Buffer.from(
      `{"v":1,"t":"${CREATED_AT.toISOString()}","i":"${ID}","__proto__":{"polluted":true}}`,
      'utf8',
    ).toString('base64url');

    expect(() => decodeActivityCursor(cursor)).toThrow('Invalid activity cursor');
    expect({}.polluted).toBeUndefined();
  });

  test.each([
    { createdAt: new Date('invalid'), _id: ID },
    { createdAt: CREATED_AT, _id: 'not-an-id' },
    { createdAt: CREATED_AT.toISOString(), _id: ID },
  ])('rejects invalid values while encoding %#', (value) => {
    expect(() => encodeActivityCursor(value)).toThrow('Invalid activity cursor');
  });

  test('builds strict descending pagination for older and equal-time smaller ids', () => {
    const decoded = decodeActivityCursor(encodeActivityCursor({ createdAt: CREATED_AT, _id: ID }));

    expect(buildCursorFilter(decoded)).toEqual({
      $or: [
        { createdAt: { $lt: CREATED_AT } },
        {
          createdAt: CREATED_AT,
          _id: { $lt: new mongoose.Types.ObjectId(ID) },
        },
      ],
    });
  });
});
