import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchSession } from '../session-api.js';

afterEach(() => vi.unstubAllGlobals());

describe('fetchSession', () => {
  it('returns a contract-validated session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b71',
      deviceName: 'Web',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastSeenAt: '2026-01-01T00:00:00.000Z',
      current: true,
    }), { status: 200 })));

    await expect(fetchSession()).resolves.toMatchObject({ current: true, deviceName: 'Web' });
  });

  it('preserves the API problem code and status for guests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'AUTH_REQUIRED',
    }), { status: 401 })));

    await expect(fetchSession()).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      status: 401,
    });
  });

  it('rejects a successful response that violates the session contract', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'not-a-session-id',
      current: true,
    }), { status: 200 })));

    await expect(fetchSession()).rejects.toBeDefined();
  });
});
