const mongoose = require('mongoose');
const AppError = require('../middleware/AppError');
const Footprint = require('../models/Footprint');
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

function tokenFromJson(json) {
  return Buffer.from(json, 'utf8').toString('base64url');
}

function expectInvalidQuery(input) {
  let error;
  try {
    normalizeActivityQuery(input);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(AppError);
  expect(error.statusCode).toBe(400);
  expect(error.message).toBe('Invalid activity query');
}

function expectInvalidCursor(cursor) {
  let error;
  try {
    decodeActivityCursor(cursor);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(TypeError);
  expect(error.message).toBe('Invalid activity cursor');
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

  test('accepts country-only smart context but requires country for a smart region', () => {
    expect(normalizeActivityQuery({ countryCode: 'cn' }))
      .toEqual({ scope: 'smart', countryCode: 'CN', limit: 20 });
    expectInvalidQuery({ regionCode: 'cn-sh' });
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
    expectInvalidQuery(input);
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
    { limit: [] },
    { limit: ['20', '21'] },
    { limit: '9'.repeat(1000) },
    { limit: 'twenty' },
    { cursor: 'not+base64url' },
    { cursor: 'a'.repeat(257) },
  ])('rejects invalid query values %#', (input) => {
    expectInvalidQuery(input);
  });

  test.each([
    { countryCode: 'C1' },
    { countryCode: 'CHN' },
    { countryCode: '🇨🇳' },
    { countryCode: 'C N' },
    { countryCode: 'CN', regionCode: 'CN/SH' },
    { countryCode: 'CN', regionCode: 'CN SH' },
    { countryCode: 'CN', regionCode: 'CN--SH' },
    { countryCode: 'CN', regionCode: '-CN-SH' },
    { countryCode: 'CN', regionCode: 'CN-🌆' },
  ])('rejects non-canonical geography codes %#', (input) => {
    expectInvalidQuery(input);
  });

  test('rejects unknown and prototype-shaped input without polluting objects', () => {
    const input = JSON.parse('{"scope":"smart","__proto__":{"polluted":true}}');

    expectInvalidQuery(input);
    expect({}.polluted).toBeUndefined();
  });

  test('rejects inherited query fields and accepts copied own fields from null-prototype input', () => {
    const inherited = Object.create({ scope: 'global' });
    const nullPrototype = Object.assign(Object.create(null), { scope: 'country', countryCode: 'cn' });

    expectInvalidQuery(inherited);
    expect(normalizeActivityQuery(nullPrototype))
      .toEqual({ scope: 'country', countryCode: 'CN', limit: 20 });
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
    expectInvalidCursor(cursor);
  });

  test.each([
    tokenFromJson(`{"t":"${CREATED_AT.toISOString()}","v":1,"i":"${ID}"}`),
    tokenFromJson(`{ "v": 1, "t": "${CREATED_AT.toISOString()}", "i": "${ID}" }`),
    tokenFromJson(`{"v":1,"v":1,"t":"${CREATED_AT.toISOString()}","i":"${ID}"}`),
  ])('rejects non-canonical semantic cursor encodings', (cursor) => {
    expectInvalidCursor(cursor);
  });

  test('rejects prototype-shaped cursor payloads', () => {
    const cursor = Buffer.from(
      `{"v":1,"t":"${CREATED_AT.toISOString()}","i":"${ID}","__proto__":{"polluted":true}}`,
      'utf8',
    ).toString('base64url');

    expectInvalidCursor(cursor);
    expect({}.polluted).toBeUndefined();
  });

  test.each([
    { createdAt: new Date('invalid'), _id: ID },
    { createdAt: CREATED_AT, _id: 'not-an-id' },
    { createdAt: CREATED_AT.toISOString(), _id: ID },
  ])('rejects invalid values while encoding %#', (value) => {
    let error;
    try {
      encodeActivityCursor(value);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(TypeError);
    expect(error.message).toBe('Invalid activity cursor');
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

  test('snapshots independent dates in cursor predicates', () => {
    const inputDate = new Date(CREATED_AT);
    const filter = buildCursorFilter({ createdAt: inputDate, _id: ID });

    inputDate.setUTCFullYear(2000);
    expect(filter.$or[0].createdAt.$lt).toEqual(CREATED_AT);
    expect(filter.$or[1].createdAt).toEqual(CREATED_AT);

    filter.$or[0].createdAt.$lt.setUTCFullYear(2001);
    expect(filter.$or[1].createdAt).toEqual(CREATED_AT);
  });
});

describe('Activity sort indexes', () => {
  test.each([
    [
      'activity_public_createdAt_id_expiry',
      { visibility: 1, createdAt: -1, _id: -1, discoveryExpiresAt: 1 },
    ],
    [
      'activity_country_public_createdAt_id_expiry',
      { countryCode: 1, visibility: 1, createdAt: -1, _id: -1, discoveryExpiresAt: 1 },
    ],
    [
      'activity_region_public_createdAt_id_expiry',
      {
        countryCode: 1,
        regionCode: 1,
        visibility: 1,
        createdAt: -1,
        _id: -1,
        discoveryExpiresAt: 1,
      },
    ],
    [
      'activity_active_public_expiry_createdAt_id',
      { visibility: 1, discoveryExpiresAt: 1, createdAt: -1, _id: -1 },
    ],
    [
      'activity_active_country_expiry_createdAt_id',
      { countryCode: 1, visibility: 1, discoveryExpiresAt: 1, createdAt: -1, _id: -1 },
    ],
    [
      'activity_active_region_expiry_createdAt_id',
      {
        countryCode: 1,
        regionCode: 1,
        visibility: 1,
        discoveryExpiresAt: 1,
        createdAt: -1,
        _id: -1,
      },
    ],
  ])('declares named %s index', (name, expectedFields) => {
    const indexes = new Map(Footprint.schema.indexes().map(([fields, options]) => [options.name, fields]));

    expect(indexes.get(name)).toEqual(expectedFields);
  });
});
