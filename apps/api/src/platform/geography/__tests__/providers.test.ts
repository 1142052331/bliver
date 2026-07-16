import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNominatimGeography } from '../providers.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('Nominatim geography provider', () => {
  it.each(['http://geo.example', 'https://127.0.0.1', 'https://169.254.169.254', 'https://10.0.0.4', 'https://user:pass@geo.example'])(
    'rejects SSRF-unsafe provider URL %s',
    (baseUrl) => {
      expect(() => createNominatimGeography({ baseUrl })).toThrow('unsafe provider URL');
    },
  );

  it('returns bounded fallbacks when reverse and search requests time out', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => new Promise<Response>(() => undefined));
    const geography = createNominatimGeography({ fetch: fetcher as unknown as typeof fetch, timeoutMs: 10, baseUrl: 'https://geo.test' });

    const reverse = geography.geocode({ latitude: 31, longitude: 121 });
    await vi.advanceTimersByTimeAsync(10);
    await expect(reverse).resolves.toEqual({ place: null, region: null });

    const search = geography.searchPlaces('Shanghai');
    await vi.advanceTimersByTimeAsync(10);
    await expect(search).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('reports provider failure at the adapter boundary without exposing coordinates', async () => {
    const observe = vi.fn();
    const geography = createNominatimGeography({ fetch: vi.fn(async () => { throw new Error('offline'); }), baseUrl: 'https://geo.test', observe });

    await expect(geography.geocode({ latitude: 31.123456, longitude: 121.654321 })).resolves.toEqual({ place: null, region: null });
    expect(observe).toHaveBeenCalledWith(false);
    expect(JSON.stringify(observe.mock.calls)).not.toMatch(/31\.123456|121\.654321/);
  });
});
