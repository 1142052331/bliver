export const READ_KEY = 'bliver_read_comments';

/** 页面加载时刻，晚于此时间的足迹/留言才算"新" */
const PAGE_LOAD_TIME = Date.now();
/** 7天时间锁：超过7天的足迹不再标记为"新打卡" */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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
 *
 * 防御：不覆盖已存在的 readTime（防止 seed 反复调用冲掉真实已读时间）
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
