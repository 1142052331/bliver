import type { Server as SocketServer, Socket } from 'socket.io';

import { resolveSession } from '../modules/identity/application/commands.js';
import type { IdentityRepositories } from '../modules/identity/application/ports.js';

function cookieToken(socket: Socket): string | undefined {
  const cookie = socket.request.headers.cookie ?? '';
  const value = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('bliver_session='));
  return value ? decodeURIComponent(value.slice('bliver_session='.length)) : undefined;
}

export function configureRealtime(io: SocketServer, identity: IdentityRepositories): void {
  io.use(async (socket, next) => {
    const bearer = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : undefined;
    const token = bearer ?? cookieToken(socket);
    if (!token) { next(new Error('AUTH_REQUIRED')); return; }
    const session = await resolveSession(identity, token);
    if (!session) { next(new Error('AUTH_REQUIRED')); return; }
    socket.data.userId = session.user.id;
    next();
  });
  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    if (typeof userId === 'string') socket.join(`user:${userId}`);
  });
}

interface RealtimeEmitter { to(room: string): { emit(event: string, payload: unknown): unknown }; }
export function emitFootprintPublished(io: RealtimeEmitter, payload: { readonly authorId: string; readonly [key: string]: unknown }): void {
  io.to(`user:${payload.authorId}`).emit('footprint:published', payload);
}
