const Footprint = require('../models/Footprint');
const { populateFootprint } = require('./footprint');

async function addComment(footprintId, userId, username, content, ip) {
  const fp = await Footprint.findById(footprintId);
  if (!fp) return null;

  fp.comments.push({ userId, username, content, ipAddress: ip });
  await fp.save();

  const populated = await populateFootprint(Footprint.findById(fp._id));
  const fpObj = populated.toObject();
  delete fpObj.realLocation;

  return { footprint: fpObj, footprintOwnerId: fp.userId.toString() };
}

module.exports = { addComment };
