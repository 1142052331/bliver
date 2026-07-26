import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchAllMapFootprints } from '../api.js';

const item = (id: string, publishedAt: string) => ({
  id,
  author: { id: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b71', name: 'River' },
  displayPoint: { lat: 31, lng: 121 },
  visibility: 'public',
  locationPrecision: 'approximate',
  publishedAt,
  isNew: false,
});

afterEach(() => vi.unstubAllGlobals());

describe('global map data', () => {
  it('loads every cursor page in global bounds and removes duplicate footprints', async () => {
    const firstId = '019c2f52-3e9b-7d1f-8d68-cf35d75d9b70';
    const secondId = '019c2f52-3e9b-7d1f-8d68-cf35d75d9b72';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [item(firstId, '2026-07-25T08:00:00.000Z')],
          nextCursor: 'next-page',
          viewerAuthenticated: true,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            item(firstId, '2026-07-25T08:00:00.000Z'),
            item(secondId, '2026-07-24T08:00:00.000Z'),
          ],
          nextCursor: null,
          viewerAuthenticated: true,
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    const result = await fetchAllMapFootprints({}, controller.signal);

    expect(result.items.map(({ id }) => id)).toEqual([firstId, secondId]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ signal: controller.signal });
    const firstUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), 'https://bliver.test');
    const secondUrl = new URL(String(fetchMock.mock.calls[1]?.[0]), 'https://bliver.test');
    expect(Object.fromEntries(firstUrl.searchParams)).toMatchObject({
      west: '-179.999999', south: '-89.999999', east: '179.999999', north: '89.999999', limit: '100',
    });
    expect(firstUrl.searchParams.has('cursor')).toBe(false);
    expect(secondUrl.searchParams.get('cursor')).toBe('next-page');
  });
});
