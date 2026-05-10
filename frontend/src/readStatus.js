export const READ_KEY = 'bliver_read_comments';

/** 页面加载时刻，用于种子时间戳——晚于此时间的足迹/留言才算"新" */
const PAGE_LOAD_TIME = Date.now();

export function getReadMap() {
  try {
    return JSON.parse(localStorage.getItem(READ_KEY)) || {};
  } catch {
    return {};
  }
}

export function markRead(fpId) {
  const map = getReadMap();
  map[fpId] = Date.now();
  localStorage.setItem(READ_KEY, JSON.stringify(map));
}

/**
 * 首次出现时用页面加载时间作为已读基准：
 * - 页面前的足迹/留言 → 不提示
 * - 页面后的足迹/留言 → 提示"新"
 */
export function seedReadMap(fpIds) {
  const existing = getReadMap();
  let changed = false;
  fpIds.forEach((id) => {
    if (!(id in existing)) {
      existing[id] = PAGE_LOAD_TIME;
      changed = true;
    }
  });
  if (changed) {
    localStorage.setItem(READ_KEY, JSON.stringify(existing));
  }
  return existing;
}

/**
 * 足迹维度已读/未读判定：
 * - 足迹本身是新打卡（createdAt > 已读时间）
 * - 或有新留言（最新评论时间 > 已读时间）
 */
export function isUnread(fp, readMap) {
  const readTime = readMap[fp._id] || 0;

  // 新打卡（足迹本身的创建时间晚于已读时间）
  const fpTime = new Date(fp.createdAt).getTime();
  if (fpTime > readTime) {
    console.log('[isUnread] TRUE (new footprint) fp:', fp._id?.slice(-6),
      'fpCreated:', new Date(fpTime).toISOString(),
      'readTime:', new Date(readTime).toISOString());
    return true;
  }

  // 新留言
  const comments = (fp.comments || []).filter((c) => c.content?.trim());
  if (comments.length === 0) return false;
  const latestTime = Math.max(...comments.map((c) => new Date(c.createdAt).getTime()));
  const result = latestTime > readTime;
  if (result) {
    console.log('[isUnread] TRUE (new comment) fp:', fp._id?.slice(-6),
      'latestComment:', new Date(latestTime).toISOString(),
      'readTime:', new Date(readTime).toISOString(),
      'diff_ms:', latestTime - readTime);
  }
  return result;
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
 * 足迹本身是否为新打卡（创建时间 > 已读时间）
 */
export function isNewFootprint(fp, readMap) {
  const readTime = readMap[fp._id] || 0;
  return new Date(fp.createdAt).getTime() > readTime;
}
