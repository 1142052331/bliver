import { clearAuth } from '../auth';
import useUIStore from '../store/useUIStore';

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

export function footprintNew(queryClient) {
  return (data) => {
    invalidateFootprintLists(queryClient);
    useUIStore.getState().emitFootprintEvent({ type: 'new', footprint: data.footprint });
  };
}

export function footprintUpdated(queryClient) {
  return (data) => {
    invalidateFootprintLists(queryClient);
    useUIStore.getState().emitFootprintEvent({ type: 'updated', footprint: data.footprint });
  };
}

export function footprintDeleted(queryClient) {
  return (data) => {
    invalidateFootprintLists(queryClient);
    useUIStore.getState().emitFootprintEvent({ type: 'deleted', footprintId: data.footprintId });
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
    queryClient.clear();
    setUser(null);
  };
}
