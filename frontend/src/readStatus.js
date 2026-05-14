/** 7天时间锁：超过7天的足迹不再标记为"新打卡" */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function getReadKey(userId) {
  return userId ? `bliver_read_${userId}` : 'bliver_read_guest';
}

export function getReadMap(userId) {
  try {
    return JSON.parse(localStorage.getItem(getReadKey(userId))) || {};
  } catch {
    return {};
  }
}

export function markRead(fpId, userId) {
  const map = getReadMap(userId);
  map[fpId] = Date.now();
  localStorage.setItem(getReadKey(userId), JSON.stringify(map));
}

/**
 * 首次出现时，只对超过7天的旧足迹标记已读。
 * 7天内的新足迹默认显示"新消息"，直到用户主动打开。
 */
export function seedReadMap(fpIds, footprints, userId) {
  const existing = getReadMap(userId);
  let changed = false;
  const now = Date.now();
  fpIds.forEach((id, i) => {
    if (!(id in existing)) {
      const fp = footprints[i];
      const fpTime = fp ? new Date(fp.createdAt).getTime() : 0;
      // 旧足迹（>7天）直接标记已读；新足迹不标记，等用户打开
      if (fpTime && (now - fpTime) > SEVEN_DAYS_MS) {
        existing[id] = now;
        changed = true;
      }
    }
  });
  if (changed) {
    localStorage.setItem(getReadKey(userId), JSON.stringify(existing));
  }
  return existing;
}

/**
 * 足迹维度已读/未读判定：
 * - 条件 A：最新留言时间 > 已读时间
 * - 条件 B：足迹 createdAt > 已读时间，且 createdAt 在最近 7 天内
 * 满足 A 或 B 任意一项 → isUnread: true
 */
export function isUnread(fp, readMap) {
  const readTime = readMap[fp._id] || 0;
  const now = Date.now();

  // 条件 B：新打卡（足迹创建时间 > 已读时间，且不超过 7 天）
  const fpTime = new Date(fp.createdAt).getTime();
  if (fpTime > readTime && (now - fpTime) < SEVEN_DAYS_MS) {
    return true;
  }

  // 条件 A：新留言（最新评论 > 已读时间）
  const comments = (fp.comments || []).filter((c) => c.content?.trim());
  if (comments.length === 0) return false;
  const latestTime = Math.max(...comments.map((c) => new Date(c.createdAt).getTime()));
  return latestTime > readTime;
}

/**
 * 返回足迹中哪些评论是未读的（评论时间 > 已读时间）
 */
export function getUnreadComments(fp, readMap) {
  const readTime = readMap[fp._id] || 0;
  return (fp.comments || []).filter(
    (c) => new Date(c.createdAt).getTime() > readTime && c.content?.trim()
  );
}

/**
 * 足迹本身是否为新打卡（创建时间 > 已读时间，且在7天内）
 */
export function isNewFootprint(fp, readMap) {
  const readTime = readMap[fp._id] || 0;
  const fpTime = new Date(fp.createdAt).getTime();
  return fpTime > readTime && (Date.now() - fpTime) < SEVEN_DAYS_MS;
}
