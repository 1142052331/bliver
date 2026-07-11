const axios = require('axios');
const { geocodeCache, GeoCache } = require('./geoCache');

const EMPTY_LOCATION = {
  displayName: 'Unknown location',
  countryCode: '',
  countryName: '',
  regionCode: '',
  regionName: '',
};

const reverseGeocodeStructured = async (lat, lng) => {
  const key = `reverse:${GeoCache.roundKey(lat, lng, 2)}`;
  const cached = geocodeCache.get(key);
  if (cached) return cached;

  try {
    const url = 'https://nominatim.openstreetmap.org/reverse';
    const { data } = await axios.get(url, {
      params: { lat, lon: lng, format: 'json', 'accept-language': 'zh' },
      headers: { 'User-Agent': 'BliverApp/1.0' },
      timeout: 5000,
    });
    const address = data.address || {};
    const result = {
      displayName: data.display_name || data.name || EMPTY_LOCATION.displayName,
      countryCode: (address.country_code || '').toUpperCase(),
      countryName: address.country || '',
      regionCode: (
        address['ISO3166-2-lvl4']
        || address['ISO3166-2-lvl3']
        || address['ISO3166-2-lvl6']
        || ''
      ).toUpperCase(),
      regionName: address.state || address.province || address.region || '',
    };
    geocodeCache.set(key, result);
    return result;
  } catch (err) {
    console.error('[Nominatim] Reverse geocode failed:', err.message);
    return { ...EMPTY_LOCATION };
  }
};

const reverseGeocode = async (lat, lng) => (
  await reverseGeocodeStructured(lat, lng)
).displayName;

module.exports = { reverseGeocode, reverseGeocodeStructured };
