const Footprint = require('../models/Footprint');
const { populateFootprint } = require('./footprint');

/**
 * Toggle a reaction emoji on a footprint.
 * Returns { footprint, isToggleOff } — isToggleOff = true when the user
 * clicked the same emoji again, effectively removing the reaction.
 */
async function toggleReaction(footprintId, userId, username, emoji) {
  // Atomically remove any existing reaction by this user
  const before = await Footprint.findOneAndUpdate(
    { _id: footprintId },
    { $pull: { reactions: { userId } } },
    { new: false }
  );

  if (!before) return null;

  const oldReaction = before.reactions.find(r => r.userId.toString() === userId);
  const isToggleOff = oldReaction && oldReaction.emoji === emoji;

  if (!isToggleOff) {
    await Footprint.findByIdAndUpdate(footprintId, {
      $push: { reactions: { userId, username, emoji } }
    });
  }

  const populated = await populateFootprint(Footprint.findById(footprintId));
  const fpObj = populated.toObject();
  delete fpObj.realLocation;

  const ownerId = (populated.userId?._id || populated.userId).toString();
  return { footprint: fpObj, isToggleOff, footprintOwnerId: ownerId };
}

module.exports = { toggleReaction };
