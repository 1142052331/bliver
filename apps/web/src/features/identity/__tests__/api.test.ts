import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchPublicProfiles, type IdentityApiError } from '../api.js';

function userId(index: number): string {
  return `019f0000-0000-7000-8000-${String(index).padStart(12, '0')}`;
}

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe('identity public profile API', () => {
  it('deduplicates and fetches public profiles in contract-sized batches', async () => {
    const ids = Array.from({ length: 201 }, (_, index) => userId(index + 1));
    const batchSizes: number[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const requested = new URL(String(input), 'http://localhost').searchParams
        .get('ids')?.split(',') ?? [];
      batchSizes.push(requested.length);
      expect(init).toEqual({ credentials: 'include' });
      return response({
        items: requested.map((id) => ({ id, username: `user-${id.slice(-4)}`, displayName: id })),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const profiles = await fetchPublicProfiles([...ids, ids[0]!, '  ', ids[100]!]);

    expect(batchSizes).toEqual([100, 100, 1]);
    expect(profiles.map((profile) => profile.id)).toEqual(ids);
  });

  it('fails the combined request when any profile batch fails', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => userId(index + 1));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        items: ids.slice(0, 100).map((id) => ({ id, username: 'visible', displayName: 'Visible' })),
      }))
      .mockResolvedValueOnce(response({ code: 'PROFILE_DIRECTORY_UNAVAILABLE' }, 503));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPublicProfiles(ids)).rejects.toEqual(
      expect.objectContaining<Partial<IdentityApiError>>({
        code: 'PROFILE_DIRECTORY_UNAVAILABLE',
        status: 503,
      }),
    );
  });
});
