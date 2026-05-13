const axios = require('axios');
const { weatherCache, GeoCache } = require('./geoCache');

const getWeather = async (lat, lng) => {
  const key = GeoCache.roundKey(lat, lng, 1); // ~10km grid
  const cached = weatherCache.get(key);
  if (cached) return cached;

  try {
    const apiKey = process.env.OPENWEATHERMAP_API_KEY;
    if (!apiKey) {
      console.warn('[Weather] OPENWEATHERMAP_API_KEY not set');
      return { weather: '', temp: null };
    }

    const url = 'https://api.openweathermap.org/data/2.5/weather';
    const { data } = await axios.get(url, {
      params: { lat, lon: lng, appid: apiKey, units: 'metric', lang: 'zh_cn' },
      timeout: 5000,
    });
    const result = (!Array.isArray(data.weather) || data.weather.length === 0)
      ? { weather: '', temp: data.main?.temp ?? null }
      : { weather: data.weather[0]?.description || '', temp: data.main?.temp ?? null };
    weatherCache.set(key, result);
    return result;
  } catch (err) {
    console.error('[Weather] Fetch failed:', err.message);
    return { weather: '', temp: null };
  }
};

module.exports = { getWeather };
