// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { deleteFootprint } from '../api.js';

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'bliver_csrf=; Max-Age=0';
});

describe('footprint API mutations', () => {
  it('sends CSRF protection when deleting a footprint', async () => {
    document.cookie = 'bliver_csrf=unit-csrf';
    const fetchMock = vi.fn(async () => ({ ok: true, status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await deleteFootprint('019f0000-0000-7000-8000-000000000002');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/footprints/019f0000-0000-7000-8000-000000000002',
      expect.objectContaining({
        method: 'DELETE',
        credentials: 'include',
        headers: { 'x-csrf-token': 'unit-csrf' },
      }),
    );
  });
});
