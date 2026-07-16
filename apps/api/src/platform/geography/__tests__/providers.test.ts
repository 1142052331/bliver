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
});
