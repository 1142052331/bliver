const { connectDB, disconnectDB, clearDB } = require('./setup');

jest.mock('../services/nominatim', () => ({
  reverseGeocode: jest.fn().mockResolvedValue('Shanghai, China'),
  reverseGeocodeStructured: jest.fn(),
}));
jest.mock('../services/weather', () => ({
  getWeather: jest.fn().mockResolvedValue({ weather: '', temp: null }),
}));

const Footprint = require('../models/Footprint');
const User = require('../models/User');
const { reverseGeocodeStructured } = require('../services/nominatim');
const footprintService = require('../services/FootprintService');

describe('FootprintService publication derivation', () => {
  const now = new Date('2026-07-12T03:04:05.000Z');

  beforeAll(connectDB);
  afterAll(disconnectDB);

  beforeEach(async () => {
    await clearDB();
    reverseGeocodeStructured.mockReset().mockResolvedValue({
      displayName: 'Shanghai, China',
      countryCode: 'CN',
      countryName: 'China',
      regionCode: 'CN-SH',
      regionName: 'Shanghai',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function createUser(lastFootprintVisibility = 'public') {
    return User.create({
      name: `publisher-${lastFootprintVisibility}-${Date.now()}`,
      password: 'hash',
      lastFootprintVisibility,
    });
  }

  test('uses saved visibility and legacy approximate precision when modern fields are absent', async () => {
    const user = await createUser('friends');

    await footprintService.create(
      user._id,
      { lat: 31.23, lng: 121.47, message: 'hello' },
      { clock: () => now },
    );

    const saved = await Footprint.findOne({ userId: user._id }).lean();
    expect(saved).toMatchObject({
      visibility: 'friends',
      locationPrecision: 'approximate',
      realLocation: { lat: 31.23, lng: 121.47 },
      placeName: 'Shanghai, China',
      countryCode: 'CN',
      countryName: 'China',
      regionCode: 'CN-SH',
      regionName: 'Shanghai',
      regionBackfill: {
        status: 'complete',
        attempts: 1,
        lastAttemptAt: now,
        error: '',
      },
    });
    expect(saved.location).not.toEqual({ lat: 31.23, lng: 121.47 });
    expect(saved.discoveryExpiresAt).toBeNull();
    expect(reverseGeocodeStructured).toHaveBeenCalledWith(saved.location.lat, saved.location.lng);
  });

  test('explicit privacy and modern precision override saved and legacy values', async () => {
    const user = await createUser('private');

    await footprintService.create(user._id, {
      lat: 31.23,
      lng: 121.47,
      precise: false,
      visibility: 'public',
      locationPrecision: 'precise',
    }, { clock: () => now });

    const [saved, updatedUser] = await Promise.all([
      Footprint.findOne({ userId: user._id }).lean(),
      User.findById(user._id).lean(),
    ]);
    expect(saved).toMatchObject({
      visibility: 'public',
      locationPrecision: 'precise',
      location: { lat: 31.23, lng: 121.47 },
      discoveryExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    });
    expect(saved.realLocation).toBeUndefined();
    expect(updatedUser.lastFootprintVisibility).toBe('public');
  });

  test('legacy precise true stores submitted coordinates without a realLocation copy', async () => {
    const user = await createUser('private');

    await footprintService.create(
      user._id,
      { lat: 31.23, lng: 121.47, precise: true },
      { clock: () => now },
    );

    const saved = await Footprint.findOne({ userId: user._id }).lean();
    expect(saved.locationPrecision).toBe('precise');
    expect(saved.location).toEqual({ lat: 31.23, lng: 121.47 });
    expect(saved.realLocation).toBeUndefined();
    expect(saved.discoveryExpiresAt).toBeNull();
  });

  test('persists a failed backfill marker without failing publication', async () => {
    const user = await createUser();
    reverseGeocodeStructured.mockResolvedValueOnce({
      displayName: 'Unknown location',
      countryCode: '',
      countryName: '',
      regionCode: '',
      regionName: '',
      error: 'network '.repeat(80),
    });

    await expect(footprintService.create(
      user._id,
      { lat: 0, lng: 0 },
      { clock: () => now },
    )).resolves.toBeDefined();

    const saved = await Footprint.findOne({ userId: user._id }).lean();
    expect(saved.placeName).toBe('Unknown location');
    expect(saved.countryCode).toBe('');
    expect(saved.regionBackfill).toMatchObject({
      status: 'failed',
      attempts: 1,
      lastAttemptAt: now,
    });
    expect(saved.regionBackfill.error.length).toBeLessThanOrEqual(240);
  });

  test('does not update visibility preference when footprint creation fails', async () => {
    const user = await createUser('private');
    jest.spyOn(Footprint, 'create').mockRejectedValueOnce(new Error('database unavailable'));

    await expect(footprintService.create(user._id, {
      lat: 31.23,
      lng: 121.47,
      visibility: 'public',
    }, { clock: () => now })).rejects.toThrow('database unavailable');

    const unchangedUser = await User.findById(user._id).lean();
    expect(unchangedUser.lastFootprintVisibility).toBe('private');
  });
});
