import { describe, expect, it, vi } from 'vitest';

import { shutdownServer } from '../server.js';

describe('API server lifecycle', () => {
  it('forces lingering connections closed after the shutdown deadline', async () => {
    const server = {
      close: vi.fn((callback: () => void) => {
        void callback;
      }),
      closeAllConnections: vi.fn(),
    };
    const closeDatabase = vi.fn(async () => undefined);

    await shutdownServer(server, closeDatabase, 5);

    expect(server.close).toHaveBeenCalledOnce();
    expect(server.closeAllConnections).toHaveBeenCalledOnce();
    expect(closeDatabase).toHaveBeenCalledOnce();
  });
});
