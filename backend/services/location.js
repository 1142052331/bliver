/**
 * Blur coordinates within ~20 km² area (circle radius ≈ 2.52 km).
 * Uses uniform random point within circle.
 */
function blurCoordinate(lat, lng) {
  const EARTH_RADIUS_KM = 6371;
  const MAX_AREA_KM2 = 20;
  const MAX_RADIUS_KM = Math.sqrt(MAX_AREA_KM2 / Math.PI); // ≈ 2.52 km

  // Random angle
  const angle = Math.random() * 2 * Math.PI;
  // Random distance (sqrt for uniform distribution within circle)
  const distance = Math.sqrt(Math.random()) * MAX_RADIUS_KM;

  // Convert distance to lat/lng offsets
  const dLat = (distance * Math.cos(angle)) / 111.32;
  const dLng = (distance * Math.sin(angle)) / (111.32 * Math.cos((lat * Math.PI) / 180));

  return {
    lat: lat + dLat,
    lng: lng + dLng,
  };
}

/**
 * Sanitize footprint for response. Admin sees real location, others see blurred.
 * realLocation is always stripped from the response.
 */
function sanitizeLocation(fp, isAdmin) {
  const { realLocation, ...rest } = fp;
  if (isAdmin && realLocation) {
    return { ...rest, location: realLocation };
  }
  return rest;
}

module.exports = { blurCoordinate, sanitizeLocation };
