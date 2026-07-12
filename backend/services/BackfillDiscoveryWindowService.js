const { randomUUID } = require('crypto');
const WindowModel = require('../models/BackfillDiscoveryWindow');

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ACTIVE_WINDOWS = 32;

function createBackfillDiscoveryWindowService({
  Window = WindowModel,
  tokenFactory = randomUUID,
  maxActiveWindows = MAX_ACTIVE_WINDOWS,
} = {}) {
  if (!Number.isInteger(maxActiveWindows) || maxActiveWindows < 1) {
    throw new RangeError('maxActiveWindows must be a positive integer');
  }

  async function acquire({ token = null, now = new Date() } = {}) {
    if (token) {
      const existing = await Window.findOne({ token, expiresAt: { $gt: now } }).lean();
      if (existing) return existing;
    }
    const newToken = String(tokenFactory());
    const expiresAt = new Date(+now + DAY_MS);
    for (let slot = 0; slot < maxActiveWindows; slot += 1) {
      try {
        const window = await Window.findOneAndUpdate(
          {
            slot,
            $or: [
              { expiresAt: { $lte: now } },
              { expiresAt: { $exists: false } },
            ],
          },
          { $set: { token: newToken, slot, createdAt: now, expiresAt } },
          { upsert: true, returnDocument: 'after' },
        ).lean();
        if (window) return window;
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    }
    throw new Error('active discovery window limit reached');
  }

  async function listActive(now = new Date()) {
    const windows = await Window.find({ expiresAt: { $gt: now } })
      .sort({ createdAt: 1, _id: 1 })
      .limit(maxActiveWindows + 1)
      .lean();
    if (windows.length > maxActiveWindows) {
      throw new Error('active discovery window limit exceeded');
    }
    return windows;
  }

  return { acquire, listActive };
}

module.exports = { createBackfillDiscoveryWindowService, MAX_ACTIVE_WINDOWS };
