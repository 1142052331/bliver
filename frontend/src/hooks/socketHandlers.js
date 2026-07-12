import { clearAuth } from '../auth';
import useUIStore from '../store/useUIStore';

const eventLedgerByClient = new WeakMap();
const MAX_EVENT_LEDGER_ENTRIES = 2048;

function clearEventLedger(queryClient) {
  eventLedgerByClient.delete(queryClient);
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

function updateCachedFootprints(queryClient, queryKey, footprintId, updateItem) {
  queryClient.setQueriesData?.(
    { queryKey },
    (data) => updateFootprintData(data, footprintId, updateItem),
  );
}

function isActiveDiscoveryFootprint(footprint, now = Date.now()) {
  if (!footprint?.visibility) return true;
  if (footprint.visibility !== 'public') return false;
  const expiresAt = new Date(footprint.discoveryExpiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now;
}

function acceptFootprintEvent(queryClient, event) {
  const footprintId = event.footprintId || event.footprint?._id;
  if (!footprintId) return false;

  let ledger = eventLedgerByClient.get(queryClient);
  if (!ledger) {
    ledger = new Map();
    eventLedgerByClient.set(queryClient, ledger);
  }
  const previous = ledger.get(footprintId);
  if (previous?.deleted) return false;

  if (event.type === 'deleted') {
    ledger.set(footprintId, { deleted: true });
    return true;
  }

  const rawVersion = event.footprint?.updatedAt || event.footprint?.createdAt;
  const version = rawVersion ? new Date(rawVersion).getTime() : null;
  const signature = JSON.stringify(event.footprint);
  if (previous?.signature === signature) return false;
  if (Number.isFinite(version) && Number.isFinite(previous?.version) && version < previous.version) {
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

export function setFootprintUnreadState(queryClient, footprintId, isUnread) {
  const updateItem = (item) => ({ ...item, isUnread });
  updateCachedFootprints(queryClient, ['footprints', 'map'], footprintId, updateItem);
  updateCachedFootprints(queryClient, ['footprints', 'activity'], footprintId, updateItem);
}

function reconcileFootprintEvent(queryClient, event) {
  if (!acceptFootprintEvent(queryClient, event)) return false;
  const footprintId = event.footprintId || event.footprint._id;
  if (event.type === 'deleted') {
    updateCachedFootprints(queryClient, ['footprints', 'map'], footprintId, () => null);
    updateCachedFootprints(queryClient, ['footprints', 'activity'], footprintId, () => null);
  } else if (!isActiveDiscoveryFootprint(event.footprint)) {
    updateCachedFootprints(queryClient, ['footprints', 'activity'], footprintId, () => null);
  }
  invalidateFootprintLists(queryClient);
  useUIStore.getState().emitFootprintEvent(event);
  return true;
}

export function footprintNew(queryClient) {
  return (data) => {
    reconcileFootprintEvent(queryClient, { type: 'new', footprint: data.footprint });
  };
}

export function footprintUpdated(queryClient) {
  return (data) => {
    reconcileFootprintEvent(queryClient, { type: 'updated', footprint: data.footprint });
  };
}

export function footprintDeleted(queryClient) {
  return (data) => {
    reconcileFootprintEvent(queryClient, { type: 'deleted', footprintId: data.footprintId });
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
