import { clearAuth } from '../auth';
import useUIStore from '../store/useUIStore';

/**
 * Socket event handler factories.
 * Each function receives the dependencies it needs and returns
 * a handler function for the corresponding socket event.
 *
 * This keeps useSocket.js lean — just lifecycle + dispatch.
 */

export function footprintNew(setFootprints) {
  return (data) => {
    setFootprints((prev) => [data.footprint, ...prev]);
    useUIStore.getState().emitFootprintEvent({ type: 'new', footprint: data.footprint });
  };
}

export function footprintUpdated(setFootprints) {
  return (data) => {
    setFootprints((prev) =>
      prev.map((fp) => (fp._id === data.footprint._id
        ? { ...fp, reactions: data.footprint.reactions, comments: data.footprint.comments }
        : fp))
    );
    useUIStore.getState().emitFootprintEvent({ type: 'updated', footprint: data.footprint });
  };
}

export function footprintDeleted(setFootprints) {
  return (data) => {
    setFootprints((prev) => prev.filter((fp) => fp._id !== data.footprintId));
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

export function newNotification(setNotifications) {
  const setMsg = useUIStore.getState().setMessageIsland;
  return (data) => {
    setNotifications((prev) => [data.notification, ...prev]);
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
