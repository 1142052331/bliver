const axios = require('axios');

const reverseGeocode = async (lat, lng) => {
  const url = 'https://nominatim.openstreetmap.org/reverse';
  const { data } = await axios.get(url, {
    params: { lat, lon: lng, format: 'json', 'accept-language': 'zh' },
    headers: { 'User-Agent': 'BliverApp/1.0' },
  });
  return data.display_name || data.name || 'Unknown location';
};

module.exports = { reverseGeocode };
