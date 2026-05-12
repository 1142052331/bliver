import { useEffect, useRef } from 'react';
import { refetchNotifications } from './useNotifications';

/**
 * Refreshes footprints + notifications and wakes zombie socket
 * when the user returns to the tab (visibilitychange → visible).
 */
export default function useVisibilityRefresh({
  user,
  socketRef,
  refetchFootprints,
  setNotifications,
}) {
  const abortRef = useRef(null);

  useEffect(() => {
    if (!user) return;

    const wakeSocket = () => {
      if (socketRef.current && !socketRef.current.connected) {
        socketRef.current.connect();
        socketRef.current.emit('user:online');
      }
    };

    const refreshData = () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      refetchFootprints();
      refetchNotifications(setNotifications, { signal: controller.signal });
    };

    const handleWake = () => {
      if (document.visibilityState !== 'visible') return;
      wakeSocket();
      refreshData();
    };

    document.addEventListener('visibilitychange', handleWake);
    return () => {
      document.removeEventListener('visibilitychange', handleWake);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [user, socketRef, refetchFootprints, setNotifications]);
}
