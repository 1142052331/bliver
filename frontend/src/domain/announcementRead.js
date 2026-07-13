export const READ_KEY = 'bliver_announce_read_last';

export function getLastRead() {
  try { return parseInt(localStorage.getItem(READ_KEY), 10) || 0; } catch { return 0; }
}

export function setLastRead(timestamp) {
  try { localStorage.setItem(READ_KEY, String(timestamp)); } catch { void 0; }
}

export function hasUnreadAnnouncements(announcements) {
  if (!announcements || announcements.length === 0) return false;
  return new Date(announcements[0].createdAt).getTime() > getLastRead();
}
