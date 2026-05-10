const axios = require('axios');

const getWeather = async (lat, lng) => {
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
    if (!Array.isArray(data.weather) || data.weather.length === 0) {
      return { weather: '', temp: data.main?.temp ?? null };
    }
    return {
      weather: data.weather[0]?.description || '',
      temp:    data.main?.temp ?? null,
    };
  } catch (err) {
    console.error('[Weather] Fetch failed:', err.message);
    return { weather: '', temp: null };
  }
};

module.exports = { getWeather };
