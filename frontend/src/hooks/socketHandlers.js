import { clearAuth } from '../auth';
import useUIStore from '../store/useUIStore';

const eventStateByClient = new WeakMap();
const MAX_EVENT_LEDGER_ENTRIES = 2048;

function normalizeViewer(viewer) {
  if (!viewer) return 'guest';
  if (typeof viewer === 'string') {
    if (viewer === 'guest' || viewer.startsWith('user:') || viewer.startsWith('admin:')) return viewer;
    return `user:${viewer}`;
  }
  const id = viewer._id || viewer.id;
  if (!id) return 'guest';
  return `${viewer.isAdmin || viewer.role === 'admin' ? 'admin' : 'user'}:${id}`;
}

function getEventState(queryClient) {
  let state = eventStateByClient.get(queryClient);
  if (!state) {
    state = { ledgers: new Map(), tombstones: new Map() };
    eventStateByClient.set(queryClient, state);
  }
  return state;
}

function clearEventLedger(queryClient, viewer) {
  if (viewer === undefined) {
    eventStateByClient.delete(queryClient);
    return;
  }
  const state = eventStateByClient.get(queryClient);
  if (!state) return;
  const identity = normalizeViewer(viewer);
  state.ledgers.delete(identity);
  state.tombstones.delete(identity);
  if (!state.ledgers.size && !state.tombstones.size) eventStateByClient.delete(queryClient);
}

function updateFootprintData(data, footprintId, updateItem) {
  const updateItems = (items) => items.flatMap((item) => {
    if (item?._id !== footprintId) return [item];
    const updated = updateItem(item);
    return updated ? [updated] : [];
  });

  if (Array.isArray(data)) return updateItems(data);
  if (Array.isArray(data?.footprints)) {
    return { ...data, footprints: updateItems(data.footprints) };
  }
  if (Array.isArray(data?.pages)) {
    return {
      ...data,
      pages: data.pages.map((page) => (
        Array.isArray(page?.items) ? { ...page, items: updateItems(page.items) } : page
      )),
    };
  }
  return data;
}

function queryKeyBelongsToViewer(queryKey, viewer) {
  const identity = normalizeViewer(viewer);
  if (queryKey?.[1] === 'activity') {
    const keyViewer = queryKey[2];
    return !(typeof keyViewer === 'string' && (keyViewer === 'guest' || keyViewer.startsWith('user:') || keyViewer.startsWith('admin:')))
      || keyViewer === identity;
  }
  if (queryKey?.[1] === 'map') {
    if (queryKey.length <= 3) return true;
    const keyViewer = String(queryKey[3] || 'guest');
    return normalizeViewer(keyViewer) === identity
      || (identity !== 'guest' && keyViewer === identity.slice(identity.indexOf(':') + 1));
  }
  return false;
}

function updateCachedFootprints(queryClient, queryKey, footprintId, updateItem, viewer) {
  queryClient.setQueriesData?.(
    { queryKey, ...(viewer === undefined ? {} : { predicate: (query) => queryKeyBelongsToViewer(query.queryKey, viewer) }) },
    (data) => updateFootprintData(data, footprintId, updateItem),
  );
}

function removeFromUnauthorizedActivityCaches(queryClient, footprintId, viewer) {
  queryClient.setQueriesData?.(
    {
      queryKey: ['footprints', 'activity'],
      predicate: (query) => !queryKeyBelongsToViewer(query.queryKey, viewer),
    },
    (data) => updateFootprintData(data, footprintId, () => null),
  );
}

function isActiveDiscoveryFootprint(footprint, now = Date.now()) {
  if (!footprint?.visibility) return true;
  if (footprint.visibility !== 'public') return false;
  const expiresAt = new Date(footprint.discoveryExpiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now;
}

function acceptFootprintEvent(queryClient, event, viewer = 'guest') {
  const footprintId = event.footprintId || event.footprint?._id;
  if (!footprintId) return false;

  const state = getEventState(queryClient);
  const identity = normalizeViewer(viewer);
  const tombstones = state.tombstones.get(identity) || new Set();
  state.tombstones.set(identity, tombstones);
  if (tombstones.has(footprintId)) return false;
  let ledger = state.ledgers.get(identity);
  if (!ledger) {
    ledger = new Map();
    state.ledgers.set(identity, ledger);
  }
  const previous = ledger.get(footprintId);
  if (event.type === 'deleted') {
    tombstones.add(footprintId);
    ledger.delete(footprintId);
    return true;
  }

  const rawVersion = event.footprint?.updatedAt || event.footprint?.createdAt;
  const version = rawVersion ? new Date(rawVersion).getTime() : null;
  const signature = JSON.stringify(event.footprint);
  if (previous?.signature === signature) return false;
  if (Number.isFinite(previous?.version)
    && (!Number.isFinite(version) || version <= previous.version)) {
    return false;
  }
  ledger.set(footprintId, { signature, version: Number.isFinite(version) ? version : null });
  while (ledger.size > MAX_EVENT_LEDGER_ENTRIES) {
    const oldest = ledger.keys().next().value;
    ledger.delete(oldest);
  }
  return true;
}

/**
 * Socket event handler factories.
 * Each function receives the dependencies it needs and returns
 * a handler function for the corresponding socket event.
 *
 * This keeps useSocket.js lean — just lifecycle + dispatch.
 */

export function invalidateFootprintLists(queryClient) {
  queryClient.invalidateQueries({ queryKey: ['footprints', 'map'] });
  queryClient.invalidateQueries({ queryKey: ['footprints', 'activity'] });
}

export function setFootprintUnreadState(queryClient, footprintId, isUnread, viewer = 'guest') {
  const updateItem = (item) => ({ ...item, isUnread });
  updateCachedFootprints(queryClient, ['footprints', 'map'], footprintId, updateItem, viewer);
  updateCachedFootprints(queryClient, ['footprints', 'activity'], footprintId, updateItem, viewer);
}

function reconcileFootprintEvent(queryClient, event, viewer = 'guest') {
  if (!acceptFootprintEvent(queryClient, event, viewer)) return false;
  const footprintId = event.footprintId || event.footprint._id;
  if (event.type === 'deleted') {
    updateCachedFootprints(queryClient, ['footprints', 'map'], footprintId, () => null);
    updateCachedFootprints(queryClient, ['footprints', 'activity'], footprintId, () => null);
  } else if (!isActiveDiscoveryFootprint(event.footprint)) {
    removeFromUnauthorizedActivityCaches(queryClient, footprintId, viewer);
  }
  invalidateFootprintLists(queryClient);
  useUIStore.getState().emitFootprintEvent(event);
  return true;
}

export function footprintNew(queryClient, viewer = 'guest') {
  return (data) => {
    reconcileFootprintEvent(queryClient, { type: 'new', footprint: data.footprint }, viewer);
  };
}

export function footprintUpdated(queryClient, viewer = 'guest') {
  return (data) => {
    reconcileFootprintEvent(queryClient, { type: 'updated', footprint: data.footprint }, viewer);
  };
}

export function footprintDeleted(queryClient, viewer = 'guest') {
  return (data) => {
    reconcileFootprintEvent(queryClient, { type: 'deleted', footprintId: data.footprintId }, viewer);
  };
}

export function onlineCount(setOnlineCount) {
  return (data) => {
    setOnlineCount(data.count);
  };
}

export function profileUpdated() {
  return (data) => {
    useUIStore.getState().emitProfileEvent({ userId: data.userId, user: data.user });
  };
}

export function newNotification(appendNotification) {
  const setMsg = useUIStore.getState().setMessageIsland;
  return (data) => {
    appendNotification(data.notification);
    const n = data.notification;
    const type = n.type === 'profile_view' ? 'profile_view' : n.type === 'reaction' ? 'reaction' : 'comment';
    setMsg({
      type,
      senderName: n.senderName,
      footprintId: n.footprintId,
      content: n.content,
    });
  };
}

export function userOnline() {
  return (data) => {
    useUIStore.getState().addToast({ type: 'online', content: `${data.name} 上线了`, duration: 3000 });
  };
}

export function userOffline() {
  return (data) => {
    useUIStore.getState().addToast({ type: 'offline', content: `${data.name} 下线了`, duration: 3000 });
  };
}

export function forceLogout(queryClient, setUser) {
  return () => {
    clearAuth();
    clearEventLedger(queryClient);
    queryClient.clear();
    setUser(null);
  };
}

export function resetFootprintEventLedger(queryClient, viewer) {
  clearEventLedger(queryClient, viewer);
}
