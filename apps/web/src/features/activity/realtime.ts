import type { QueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';

export function connectActivityRealtime(client: QueryClient): () => void {
  const socket = io('/', {
    transports: ['websocket'],
    withCredentials: true,
    autoConnect: true,
  });
  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: ['activity'] });
  };
  socket.on('footprint:published', refresh);
  socket.on('footprint:deleted', refresh);
  socket.io.on('reconnect', refresh);
  return () => {
    socket.off('footprint:published', refresh);
    socket.off('footprint:deleted', refresh);
    socket.io.off('reconnect', refresh);
    socket.disconnect();
  };
}
