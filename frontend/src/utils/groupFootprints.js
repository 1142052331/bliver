/**
 * Group footprints by user ID, sort each group's items by createdAt ascending.
 * Used by TimelineDrawer and ClusterDetailPanel.
 */
export function groupFootprintsByUser(footprints) {
  const map = {};
  footprints.forEach((fp) => {
    const uid = fp.userId?._id || fp.userId || 'unknown';
    if (!map[uid]) map[uid] = { user: fp.userId || null, items: [] };
    map[uid].items.push(fp);
  });
  Object.values(map).forEach((g) => g.items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
  return Object.values(map);
}
