const { blurCoordinate, sanitizeLocation } = require('../services/location');

function distanceKm(from, to) {
  const radius = 6371;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const dLat = lat2 - lat1;
  const dLng = toRadians(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(a)));
}

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

  test.each([false, true])('strips comment IP addresses from ordinary responses (admin=%s)', (isAdmin) => {
    const comment = {
      _id: 'comment-id',
      userId: 'user-id',
      username: 'commenter',
      content: 'public comment',
      ipAddress: '203.0.113.7',
      createdAt: new Date('2026-07-12T10:00:00.000Z'),
    };
    const { ipAddress, ...publicComment } = comment;

    const result = sanitizeLocation({ ...footprint, comments: [comment] }, isAdmin);

    expect(result.comments).toEqual([publicComment]);
    expect(result.comments[0]).not.toHaveProperty('ipAddress');
  });
});

describe('blurCoordinate', () => {
  afterEach(() => jest.restoreAllMocks());

  test.each([
    [{ lat: 90, lng: 0 }, 0],
    [{ lat: -90, lng: 0 }, 0.5],
    [{ lat: 0, lng: 180 }, 0.25],
    [{ lat: 0, lng: -180 }, 0.75],
    [{ lat: 89.9999, lng: 179.9 }, 0.25],
    [{ lat: -89.9999, lng: -179.9 }, 0.75],
  ])('returns finite bounded coordinates from %p', (origin, bearingRandom) => {
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(bearingRandom)
      .mockReturnValueOnce(1);

    const result = blurCoordinate(origin.lat, origin.lng);

    expect(Number.isFinite(result.lat)).toBe(true);
    expect(Number.isFinite(result.lng)).toBe(true);
    expect(result.lat).toBeGreaterThanOrEqual(-90);
    expect(result.lat).toBeLessThanOrEqual(90);
    expect(result.lng).toBeGreaterThanOrEqual(-180);
    expect(result.lng).toBeLessThanOrEqual(180);
  });

  test('keeps the maximum blur radius at the configured 20 square kilometer area', () => {
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0.25)
      .mockReturnValueOnce(1);
    const origin = { lat: 31.23, lng: 121.47 };

    const result = blurCoordinate(origin.lat, origin.lng);

    expect(distanceKm(origin, result)).toBeCloseTo(Math.sqrt(20 / Math.PI), 6);
  });

  test('retains square-root radial sampling for uniform area distribution', () => {
    const random = jest.spyOn(Math, 'random');
    random.mockReturnValueOnce(0).mockReturnValueOnce(0.25);
    const halfRadius = blurCoordinate(0, 0);
    random.mockReturnValueOnce(0).mockReturnValueOnce(1);
    const fullRadius = blurCoordinate(0, 0);

    expect(distanceKm({ lat: 0, lng: 0 }, halfRadius))
      .toBeCloseTo(distanceKm({ lat: 0, lng: 0 }, fullRadius) / 2, 6);
  });
});
