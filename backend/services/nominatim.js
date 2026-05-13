const axios = require('axios');
const { geocodeCache, GeoCache } = require('./geoCache');

const reverseGeocode = async (lat, lng) => {
  const key = GeoCache.roundKey(lat, lng, 2); // ~1km grid
  const cached = geocodeCache.get(key);
  if (cached) return cached;

  try {
    const url = 'https://nominatim.openstreetmap.org/reverse';
    const { data } = await axios.get(url, {
      params: { lat, lon: lng, format: 'json', 'accept-language': 'zh' },
      headers: { 'User-Agent': 'BliverApp/1.0' },
      timeout: 5000,
    });
    const result = data.display_name || data.name || 'Unknown location';
    geocodeCache.set(key, result);
    return result;
  } catch (err) {
    console.error('[Nominatim] Reverse geocode failed:', err.message);
    return 'Unknown location';
  }
};

module.exports = { reverseGeocode };
