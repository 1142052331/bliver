jest.mock('axios');

const axios = require('axios');
const { geocodeCache } = require('../services/geoCache');
const { reverseGeocode, reverseGeocodeStructured } = require('../services/nominatim');

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

  test('returns a stable empty context when reverse geocoding fails', async () => {
    axios.get.mockRejectedValueOnce(new Error('network'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(reverseGeocodeStructured(0, 0)).resolves.toEqual({
      displayName: 'Unknown location',
      countryCode: '',
      countryName: '',
      regionCode: '',
      regionName: '',
    });

    consoleError.mockRestore();
  });
});
