import { io } from 'socket.io-client';
import type { QueryClient } from '@tanstack/react-query';
import { invalidateMapQueries } from './api.js';

export function connectMapRealtime(client: QueryClient): () => void {
  const socket = io('/', { transports: ['websocket'], autoConnect: true });
  const refresh = () => { void invalidateMapQueries(client); };
  socket.on('footprint:published', refresh);
  socket.io.on('reconnect', refresh);
  return () => { socket.off('footprint:published', refresh); socket.io.off('reconnect', refresh); socket.disconnect(); };
}
