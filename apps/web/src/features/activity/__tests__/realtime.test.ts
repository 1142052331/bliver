import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const socket = {
  on: vi.fn(),
  off: vi.fn(),
  disconnect: vi.fn(),
  io: { on: vi.fn(), off: vi.fn() },
};

vi.mock('socket.io-client', () => ({ io: vi.fn(() => socket) }));

import { connectActivityRealtime } from '../realtime.js';

describe('activity realtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invalidates Activity after the published projection is available', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue();
    const disconnect = connectActivityRealtime(client);
    const published = socket.on.mock.calls.find(([event]) => event === 'footprint:published')?.[1] as (() => void) | undefined;

    expect(published).toBeDefined();
    published?.();
    await Promise.resolve();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['activity'] });

    const deleted = socket.on.mock.calls.find(([event]) => event === 'footprint:deleted')?.[1] as (() => void) | undefined;
    expect(deleted).toBeDefined();
    deleted?.();
    await Promise.resolve();
    expect(invalidate).toHaveBeenCalledTimes(2);

    disconnect();
    expect(socket.off).toHaveBeenCalledWith('footprint:published', published);
    expect(socket.off).toHaveBeenCalledWith('footprint:deleted', deleted);
    expect(socket.disconnect).toHaveBeenCalledOnce();
  });
});
