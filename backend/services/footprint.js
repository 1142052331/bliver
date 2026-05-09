const Footprint = require('../models/Footprint');

/**
 * 统一填充足迹的 userId 字段（用户基本信息 + 连续打卡数据）。
 */
function populateFootprint(query) {
  return query.populate('userId', 'name avatarUrl isOnline role checkinStreak');
}

module.exports = { populateFootprint };
