const User = require('../models/User');

const cache = new Map(); // userId → { name, expiresAt }
const TTL = 5 * 60 * 1000; // 5 minutes

async function resolveUserName(userId) {
  if (!userId) return 'Unknown';
  const key = userId.toString();
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.name;

  try {
    const user = await User.findById(key).select('name').lean();
    const name = user?.name || 'Unknown';
    cache.set(key, { name, expiresAt: Date.now() + TTL });
    return name;
  } catch {
    return 'Unknown';
  }
}

async function resolveUserNames(userIds) {
  const unique = [...new Set(userIds.map(id => id?.toString()).filter(Boolean))];
  const results = {};
  const toFetch = [];

  for (const id of unique) {
    const entry = cache.get(id);
    if (entry && Date.now() < entry.expiresAt) {
      results[id] = entry.name;
    } else {
      toFetch.push(id);
    }
  }

  if (toFetch.length > 0) {
    const users = await User.find({ _id: { $in: toFetch } }).select('name').lean();
    for (const u of users) {
      const id = u._id.toString();
      const name = u.name;
      cache.set(id, { name, expiresAt: Date.now() + TTL });
      results[id] = name;
    }
  }

  return results;
}

function invalidateUser(userId) {
  cache.delete(userId?.toString());
}

module.exports = { resolveUserName, resolveUserNames, invalidateUser };
