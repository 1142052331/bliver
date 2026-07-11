const mongoose = require('mongoose');
const { resolveUserNames } = require('../services/userNameCache');

const footprintSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  location:  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  realLocation: {
    lat: { type: Number },
    lng: { type: Number },
  },
  placeName: { type: String, default: '' },
  message:   { type: String, default: '' },
  mood:      { type: String, default: '' },
  photoUrl:  { type: String, default: '' },
  visibility: { type: String, enum: ['public', 'friends', 'private'] },
  locationPrecision: { type: String, enum: ['approximate', 'precise'], default: 'approximate' },
  countryCode: { type: String, default: '' },
  countryName: { type: String, default: '' },
  regionCode: { type: String, default: '' },
  regionName: { type: String, default: '' },
  discoveryExpiresAt: { type: Date, default: null },
  regionBackfill: {
    status: {
      type: String,
      enum: ['pending', 'processing', 'complete', 'failed', 'dead'],
      default: 'pending',
    },
    attempts: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    error: { type: String, default: '', maxlength: 240 },
    runToken: { type: String, default: '' },
    leaseExpiresAt: { type: Date, default: null },
    claimedFromStatus: { type: String, default: '' },
  },
  reactions: [{
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    emoji:    { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  }],
  comments:  [{
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username:  { type: String, required: true },
    content:   { type: String, required: true },
    ipAddress: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

footprintSchema.index({ createdAt: -1 });
footprintSchema.index({ visibility: 1, discoveryExpiresAt: 1, createdAt: -1, _id: -1 });
footprintSchema.index({ countryCode: 1, visibility: 1, discoveryExpiresAt: 1, createdAt: -1, _id: -1 });
footprintSchema.index({ countryCode: 1, regionCode: 1, visibility: 1, discoveryExpiresAt: 1, createdAt: -1, _id: -1 });
footprintSchema.index({ userId: 1, createdAt: -1, _id: -1 });
footprintSchema.index({ 'reactions.userId': 1, 'reactions.createdAt': -1 });
footprintSchema.index({ 'comments.userId': 1, 'comments.createdAt': -1 });
footprintSchema.index(
  { 'comments.username': 1, 'comments.createdAt': -1 },
  { name: 'profile_comments_username_createdAt' },
);
footprintSchema.index(
  { 'regionBackfill.status': 1, _id: 1 },
  { name: 'region_backfill_status_id' },
);
footprintSchema.index(
  { 'regionBackfill.status': 1, 'regionBackfill.leaseExpiresAt': 1, _id: 1 },
  { name: 'region_backfill_status_lease_id' },
);

// Post-find middleware: resolve denormalized usernames from userId
async function resolveUsernames(docs) {
  if (!docs) return;
  const arr = Array.isArray(docs) ? docs : [docs];
  const ids = new Set();
  for (const doc of arr) {
    if (!doc) continue;
    const reactions = doc.reactions || [];
    const comments = doc.comments || [];
    for (const r of reactions) { if (r.userId) ids.add(r.userId.toString()); }
    for (const c of comments) { if (c.userId) ids.add(c.userId.toString()); }
  }
  if (ids.size === 0) return;
  const names = await resolveUserNames([...ids]);
  for (const doc of arr) {
    if (!doc) continue;
    for (const r of (doc.reactions || [])) {
      const resolved = names[r.userId?.toString()];
      if (resolved) r.username = resolved;
    }
    for (const c of (doc.comments || [])) {
      const resolved = names[c.userId?.toString()];
      if (resolved) c.username = resolved;
    }
  }
}

footprintSchema.post('find', resolveUsernames);
footprintSchema.post('findOne', resolveUsernames);
footprintSchema.post('findById', resolveUsernames);

footprintSchema.statics.findSafe = function (filter, { isAdmin = false } = {}) {
  const query = this.find(filter);
  if (!isAdmin) query.select('-realLocation');
  return query;
};

footprintSchema.statics.findByIdSafe = function (id, { isAdmin = false } = {}) {
  const query = this.findById(id);
  if (!isAdmin) query.select('-realLocation');
  return query;
};

module.exports = mongoose.model('Footprint', footprintSchema);
