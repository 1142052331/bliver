const axios = require('axios');

const reverseGeocode = async (lat, lng) => {
  try {
    const url = 'https://nominatim.openstreetmap.org/reverse';
    const { data } = await axios.get(url, {
      params: { lat, lon: lng, format: 'json', 'accept-language': 'zh' },
      headers: { 'User-Agent': 'BliverApp/1.0' },
      timeout: 5000,
    });
    return data.display_name || data.name || 'Unknown location';
  } catch (err) {
    console.error('[Nominatim] Reverse geocode failed:', err.message);
    return 'Unknown location';
  }
};

module.exports = { reverseGeocode };
