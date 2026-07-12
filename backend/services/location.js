/**
 * Blur coordinates within ~20 km² area (circle radius ≈ 2.52 km).
 * Uses uniform random point within circle.
 */
function blurCoordinate(lat, lng) {
  const EARTH_RADIUS_KM = 6371;
  const MAX_AREA_KM2 = 20;
  const MAX_RADIUS_KM = Math.sqrt(MAX_AREA_KM2 / Math.PI); // ≈ 2.52 km

  const bearing = Math.random() * 2 * Math.PI;
  const distance = Math.sqrt(Math.random()) * MAX_RADIUS_KM;
  const angularDistance = distance / EARTH_RADIUS_KM;
  const latitude = lat * Math.PI / 180;
  const longitude = lng * Math.PI / 180;

  const destinationLatitude = Math.asin(Math.max(-1, Math.min(1,
    Math.sin(latitude) * Math.cos(angularDistance)
      + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing)
  )));
  const destinationLongitude = longitude + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
    Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(destinationLatitude)
  );
  const longitudeDegrees = destinationLongitude * 180 / Math.PI;

  return {
    lat: destinationLatitude * 180 / Math.PI,
    lng: ((longitudeDegrees + 540) % 360) - 180,
  };
}

/**
 * Sanitize footprint for response. Admin sees real location, others see blurred.
 * realLocation is always stripped from the response.
 */
function sanitizeLocation(fp, isAdmin) {
  const {
    realLocation,
    regionBackfill,
    discoveryOrigin,
    discoveryWindowToken,
    ...rest
  } = fp;
  const sanitized = Array.isArray(rest.comments)
    ? {
      ...rest,
      comments: rest.comments.map((comment) => {
        const { ipAddress, ...publicComment } = comment;
        return publicComment;
      }),
    }
    : rest;
  if (isAdmin && realLocation) {
    return { ...sanitized, location: realLocation, regionBackfill };
  }
  if (isAdmin) return { ...sanitized, regionBackfill };
  return sanitized;
}

module.exports = { blurCoordinate, sanitizeLocation };
