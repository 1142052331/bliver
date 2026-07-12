const mongoose = require('mongoose');

const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 256;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/;

function invalidCursor() {
  return new TypeError('Invalid activity cursor');
}

function normalizeObjectId(value) {
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)) {
    return value.toLowerCase();
  }
  throw invalidCursor();
}

function encodeActivityCursor(value) {
  if (!value || typeof value !== 'object' || !(value.createdAt instanceof Date)
    || Number.isNaN(value.createdAt.getTime())) {
    throw invalidCursor();
  }

  const id = normalizeObjectId(value._id);
  const payload = {
    v: CURSOR_VERSION,
    t: value.createdAt.toISOString(),
    i: id,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeActivityCursor(cursor) {
  if (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH
    || !BASE64URL_PATTERN.test(cursor)) {
    throw invalidCursor();
  }

  let payload;
  try {
    const bytes = Buffer.from(cursor, 'base64url');
    if (bytes.toString('base64url') !== cursor) throw invalidCursor();
    payload = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw invalidCursor();
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || Object.getPrototypeOf(payload) !== Object.prototype
    || Object.keys(payload).length !== 3
    || !Object.hasOwn(payload, 'v') || !Object.hasOwn(payload, 't') || !Object.hasOwn(payload, 'i')
    || payload.v !== CURSOR_VERSION
    || typeof payload.t !== 'string'
    || typeof payload.i !== 'string'
    || !OBJECT_ID_PATTERN.test(payload.i)) {
    throw invalidCursor();
  }

  const createdAt = new Date(payload.t);
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== payload.t) {
    throw invalidCursor();
  }

  return {
    version: CURSOR_VERSION,
    createdAt,
    _id: new mongoose.Types.ObjectId(payload.i),
  };
}

function buildCursorFilter(cursor) {
  if (!cursor || !(cursor.createdAt instanceof Date) || Number.isNaN(cursor.createdAt.getTime())) {
    throw invalidCursor();
  }
  const id = new mongoose.Types.ObjectId(normalizeObjectId(cursor._id));

  return {
    $or: [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: id } },
    ],
  };
}

module.exports = {
  encodeActivityCursor,
  decodeActivityCursor,
  buildCursorFilter,
};
