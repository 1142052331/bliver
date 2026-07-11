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
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.error) {
      throw new Error('Invalid provider response');
    }
    const address = data.address || {};
    if (!data.display_name && !data.name && Object.keys(address).length === 0) {
      throw new Error('Invalid provider response');
    }
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
    return {
      ...EMPTY_LOCATION,
      failureCode: 'reverse_geocode_failed',
    };
  }
};

const reverseGeocode = async (lat, lng) => (
  await reverseGeocodeStructured(lat, lng)
).displayName;

async function searchPlaces(query, { countryCode = '', regionCode = '', signal } = {}) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];
  const key = `search:${normalizedQuery.toLocaleLowerCase()}:${countryCode}:${regionCode}`;
  const cached = geocodeCache.get(key);
  if (cached) return cached;

  const { data } = await axios.get('https://nominatim.openstreetmap.org/search', {
    params: {
      q: normalizedQuery,
      format: 'jsonv2',
      'accept-language': 'zh',
      addressdetails: 1,
      limit: 5,
      ...(countryCode ? { countrycodes: countryCode.toLowerCase() } : {}),
    },
    headers: { 'User-Agent': 'BliverApp/1.0' },
    timeout: 5000,
    signal,
  });
  const places = (Array.isArray(data) ? data : []).flatMap((place) => {
    const lat = Number(place.lat);
    const lng = Number(place.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    const box = (place.boundingbox || []).map(Number);
    return [{
      id: String(place.place_id),
      label: place.display_name || place.name || '未命名地点',
      lat,
      lng,
      bounds: box.length === 4 && box.every(Number.isFinite)
        ? [[box[0], box[2]], [box[1], box[3]]]
        : null,
      type: place.type || '',
    }];
  });
  geocodeCache.set(key, places);
  return places;
}

module.exports = { reverseGeocode, reverseGeocodeStructured, searchPlaces };
