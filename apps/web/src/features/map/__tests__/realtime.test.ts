import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const socket = {
  on: vi.fn(),
  off: vi.fn(),
  disconnect: vi.fn(),
  io: { on: vi.fn(), off: vi.fn() },
};

vi.mock('socket.io-client', () => ({ io: vi.fn(() => socket) }));

import { connectMapRealtime } from '../realtime.js';

describe('map realtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invalidates map queries after a socket reconnect', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue();
    const disconnect = connectMapRealtime(client);
    const reconnect = socket.io.on.mock.calls.find(([event]) => event === 'reconnect')?.[1] as (() => void) | undefined;

    expect(reconnect).toBeDefined();
    reconnect?.();
    await Promise.resolve();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['map', 'footprints'] });

    disconnect();
    expect(socket.io.off).toHaveBeenCalledWith('reconnect', expect.any(Function));
    expect(socket.disconnect).toHaveBeenCalledOnce();
  });
});
