jest.mock('axios');

const axios = require('axios');
const { geocodeCache } = require('../services/geoCache');
const { reverseGeocode, reverseGeocodeStructured, searchPlaces } = require('../services/nominatim');

describe('structured Nominatim reverse geocoding', () => {
  beforeEach(() => {
    axios.get.mockReset();
    geocodeCache.cache.clear();
  });

  test('normalizes country and first-level region metadata', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        display_name: '中国上海市黄浦区',
        address: {
          country_code: 'cn',
          country: '中国',
          state: '上海市',
          'ISO3166-2-lvl4': 'CN-SH',
        },
      },
    });

    await expect(reverseGeocodeStructured(31.23, 121.47)).resolves.toEqual({
      displayName: '中国上海市黄浦区',
      countryCode: 'CN',
      countryName: '中国',
      regionCode: 'CN-SH',
      regionName: '上海市',
    });
    await expect(reverseGeocode(31.23, 121.47)).resolves.toBe('中国上海市黄浦区');
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  test('falls back to city when a coded region has no state name', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        display_name: 'Beijing, China',
        address: {
          country_code: 'cn',
          country: 'China',
          city: 'Beijing',
          'ISO3166-2-lvl4': 'CN-BJ',
        },
      },
    });

    await expect(reverseGeocodeStructured(39.9, 116.4)).resolves.toMatchObject({
      countryCode: 'CN',
      regionCode: 'CN-BJ',
      regionName: 'Beijing',
    });
  });

  test('returns a stable empty context when reverse geocoding fails', async () => {
    axios.get.mockRejectedValueOnce(new Error('network'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(reverseGeocodeStructured(0, 0)).resolves.toEqual({
      displayName: 'Unknown location',
      countryCode: '',
      countryName: '',
      regionCode: '',
      regionName: '',
      failureCode: 'reverse_geocode_failed',
    });

    consoleError.mockRestore();
  });

  test('treats a provider error response as a failure and does not cache it', async () => {
    axios.get
      .mockResolvedValueOnce({ data: { error: 'Unable to geocode' } })
      .mockResolvedValueOnce({
        data: {
          display_name: 'Recovered place',
          address: { country_code: 'jp', country: 'Japan' },
        },
      });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(reverseGeocodeStructured(35, 139)).resolves.toMatchObject({
      displayName: 'Unknown location',
      failureCode: 'reverse_geocode_failed',
    });
    await expect(reverseGeocodeStructured(35, 139)).resolves.toMatchObject({
      displayName: 'Recovered place',
      countryCode: 'JP',
    });
    expect(axios.get).toHaveBeenCalledTimes(2);

    consoleError.mockRestore();
  });

  test('treats a malformed success response as a failure without caching it', async () => {
    axios.get
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({
        data: {
          display_name: 'Recovered place',
          address: { country_code: 'cn', country: 'China' },
        },
      });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(reverseGeocodeStructured(30, 120)).resolves.toMatchObject({
      failureCode: 'reverse_geocode_failed',
    });
    await expect(reverseGeocodeStructured(30, 120)).resolves.toMatchObject({
      displayName: 'Recovered place',
    });
    expect(axios.get).toHaveBeenCalledTimes(2);

    consoleError.mockRestore();
  });

  test('searches and caches bounded place results', async () => {
    axios.get.mockResolvedValueOnce({
      data: [{
        place_id: 42,
        display_name: '日本高知县高知市',
        lat: '33.5597',
        lon: '133.5311',
        boundingbox: ['33.4', '33.7', '133.3', '133.8'],
        type: 'city',
      }],
    });

    const first = await searchPlaces('高知', { countryCode: 'JP' });
    const second = await searchPlaces('高知', { countryCode: 'JP' });

    expect(first).toEqual([{
      id: '42',
      label: '日本高知县高知市',
      lat: 33.5597,
      lng: 133.5311,
      bounds: [[33.4, 133.3], [33.7, 133.8]],
      type: 'city',
    }]);
    expect(second).toEqual(first);
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(axios.get).toHaveBeenCalledWith(
      'https://nominatim.openstreetmap.org/search',
      expect.objectContaining({ params: expect.objectContaining({ q: '高知', countrycodes: 'jp', limit: 5 }) }),
    );
  });
});
