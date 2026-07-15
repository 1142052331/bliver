import { afterEach, describe, expect, it, vi } from 'vitest';

const socket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  io: { on: vi.fn(), off: vi.fn() },
};

vi.mock('socket.io-client', () => ({ io: vi.fn(() => socket) }));

import { connectConversationRealtime } from '../realtime.js';

afterEach(() => {
  vi.clearAllMocks();
});

describe('conversation realtime client', () => {
  it('subscribes to message, typing, read, reconnect and revoked-session states', () => {
    const handlers = {
      onMessage: vi.fn(),
      onTyping: vi.fn(),
      onRead: vi.fn(),
      onReconnect: vi.fn(),
      onSessionExpired: vi.fn(),
    };

    const realtime = connectConversationRealtime(handlers);
    expect(socket.on).toHaveBeenCalledWith('conversation:message', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('conversation:presence', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('conversation:read', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
    expect(socket.io.on).toHaveBeenCalledWith('reconnect', handlers.onReconnect);

    const expired = socket.on.mock.calls.find(([event]) => event === 'connect_error')?.[1] as ((error: Error) => void);
    expired(new Error('AUTH_REQUIRED'));
    expect(handlers.onSessionExpired).toHaveBeenCalledOnce();

    realtime.disconnect();
    expect(socket.disconnect).toHaveBeenCalledOnce();
  });

  it('always sends messages with the caller idempotency key', async () => {
    socket.emit.mockImplementation((_event, _payload, acknowledge) => acknowledge({ ok: true, message: { id: '019f0000-0000-7000-8000-000000000004', conversationId: '019f0000-0000-7000-8000-000000000003', senderId: '019f0000-0000-7000-8000-000000000001', content: 'hello', kind: 'message', sentAt: '2026-07-15T08:00:00.000Z', eventId: '019f0000-0000-7000-8000-000000000005', moderation: { status: 'pending', labels: [] } } }));
    const realtime = connectConversationRealtime({ onMessage: vi.fn(), onTyping: vi.fn(), onRead: vi.fn(), onReconnect: vi.fn(), onSessionExpired: vi.fn() });
    await realtime.sendMessage('019f0000-0000-7000-8000-000000000003', 'hello', 'stable-key');
    expect(socket.emit).toHaveBeenCalledWith('conversation:message', expect.objectContaining({ idempotencyKey: 'stable-key' }), expect.any(Function));
  });
});
