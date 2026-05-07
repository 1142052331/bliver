const axios = require('axios');

const getWeather = async (lat, lng) => {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  const url = 'https://api.openweathermap.org/data/2.5/weather';
  const { data } = await axios.get(url, {
    params: { lat, lon: lng, appid: apiKey, units: 'metric', lang: 'zh_cn' },
  });
  return {
    weather: data.weather[0]?.description || '',
    temp:    data.main?.temp ?? null,
  };
};

module.exports = { getWeather };
