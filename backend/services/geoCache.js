/**
 * In-memory LRU cache for geocoding and weather lookups.
 * Keyed by rounded coordinates to deduplicate nearby requests.
 */

class GeoCache {
  constructor({ maxSize = 500, defaultTTL = 3600000 } = {}) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
    this.cache = new Map(); // key → { value, expiresAt }
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key, value, ttl) {
    if (this.cache.size >= this.maxSize) {
      // Evict oldest (first entry)
      const first = this.cache.keys().next().value;
      this.cache.delete(first);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + (ttl || this.defaultTTL) });
  }

  static roundKey(lat, lng, decimals) {
    const f = Math.pow(10, decimals);
    return `${Math.round(lat * f) / f}:${Math.round(lng * f) / f}`;
  }
}

// Separate caches with different TTLs
const geocodeCache = new GeoCache({ maxSize: 500, defaultTTL: 24 * 3600000 }); // 24h
const weatherCache = new GeoCache({ maxSize: 500, defaultTTL: 3600000 });       // 1h

module.exports = { GeoCache, geocodeCache, weatherCache };
