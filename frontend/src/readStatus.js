/** 7天时间锁：超过7天的足迹不再标记为"新打卡" */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function getReadKey(userId) {
  return userId ? `bliver_read_${userId}` : 'bliver_read_guest';
}

export function getLegacyReadEntries(userId) {
  if (!userId) return [];
  let readMap;
  try {
    readMap = JSON.parse(localStorage.getItem(getReadKey(userId)));
  } catch {
    return [];
  }
  if (!readMap || typeof readMap !== 'object' || Array.isArray(readMap)) return [];

  return Object.entries(readMap)
    .flatMap(([footprintId, value]) => {
      const readAt = Number(value);
      return footprintId && Number.isFinite(readAt) && readAt > 0
        ? [{ footprintId, readAt }]
        : [];
    })
    .sort((left, right) => right.readAt - left.readAt)
    .slice(0, 500);
}

function getFirstVisitKey(userId) {
  return userId ? `bliver_first_visit_${userId}` : 'bliver_first_visit_guest';
}

/**
 * 获取用户首次访问时间戳。
 * 首次访问时自动记录，之后保持不变。
 */
export function getFirstVisitTime(userId) {
  const key = getFirstVisitKey(userId);
  let time = localStorage.getItem(key);
  if (!time) {
    time = Date.now();
    localStorage.setItem(key, time);
  }
  return Number(time);
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
 * 首次出现时，对首次访问之前的足迹标记已读。
 * 只有首次访问之后创建的足迹才显示"新消息"。
 */
export function seedReadMap(fpIds, footprints, userId) {
  const existing = getReadMap(userId);
  const firstVisit = getFirstVisitTime(userId);
  let changed = false;
  fpIds.forEach((id, i) => {
    if (!(id in existing)) {
      const fp = footprints[i];
      const fpTime = fp ? new Date(fp.createdAt).getTime() : 0;
      // 首次访问之前的足迹标记为已读
      if (fpTime && fpTime < firstVisit) {
        existing[id] = firstVisit;
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
