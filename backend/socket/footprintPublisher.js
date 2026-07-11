const User = require('../models/User');
const { getFriendIds } = require('../services/SuperuserPolicy');
const { id } = require('../policies/FootprintVisibilityPolicy');

const FOOTPRINT_EVENTS = ['footprint:new', 'footprint:updated'];

function isActivePublic(footprint, now) {
  if (!footprint.visibility) return true;
  if (footprint.visibility !== 'public') return false;
  const expiresAt = new Date(footprint.discoveryExpiresAt);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt > now;
}

async function getAdminIds() {
  const admins = await User.find({ role: 'admin' }).select('_id').lean();
  return new Set(admins.map((admin) => id(admin)));
}

async function publishFootprint(io, event, payload, { now = new Date() } = {}) {
  if (event === 'footprint:deleted') {
    await io.emit(event, { footprintId: payload?.footprintId });
    return;
  }

  const footprint = payload?.footprint;
  if (!footprint) return;
  if (isActivePublic(footprint, now)) {
    await io.emit(event, payload);
    return;
  }

  const ownerId = id(footprint.userId);
  const recipients = await getAdminIds();
  if (ownerId) recipients.add(ownerId);

  if (footprint.visibility === 'friends' || footprint.visibility === 'public') {
    const friendIds = await getFriendIds(ownerId);
    for (const friendId of friendIds) recipients.add(id(friendId));
  }

  for (const recipientId of recipients) {
    if (recipientId) await io.to(recipientId).emit(event, payload);
  }
}

function registerFootprintPublisher(io, bus) {
  for (const event of [...FOOTPRINT_EVENTS, 'footprint:deleted']) {
    bus.on(event, (payload) => {
      publishFootprint(io, event, payload).catch(() => {
        console.error('[Socket] Footprint publication failed');
      });
    });
  }
}

module.exports = { publishFootprint, registerFootprintPublisher };
