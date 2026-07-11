const { sanitizeLocation } = require('../services/location');

describe('sanitizeLocation', () => {
  const footprint = {
    _id: 'footprint-id',
    location: { lat: 31, lng: 121 },
    realLocation: { lat: 31.23, lng: 121.47 },
    regionBackfill: {
      status: 'failed',
      attempts: 2,
      error: 'reverse_geocode_failed',
    },
  };

  test('strips exact and operational location metadata from ordinary responses', () => {
    expect(sanitizeLocation(footprint, false)).toEqual({
      _id: 'footprint-id',
      location: { lat: 31, lng: 121 },
    });
  });

  test('keeps admin-safe exact location and operational metadata for explicit admins', () => {
    expect(sanitizeLocation(footprint, true)).toEqual({
      _id: 'footprint-id',
      location: { lat: 31.23, lng: 121.47 },
      regionBackfill: footprint.regionBackfill,
    });
  });
});
