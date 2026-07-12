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
const bus = require('../events/bus');

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
      discoveryOrigin: 'publication',
      discoveryWindowToken: '',
      locationPrecision: 'precise',
      location: { lat: 31.23, lng: 121.47 },
      discoveryExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    });
    expect(saved.realLocation).toBeUndefined();
    expect(updatedUser.lastFootprintVisibility).toBe('public');
    expect(saved.createdAt).toEqual(now);
    expect(saved.discoveryExpiresAt.getTime() - saved.createdAt.getTime()).toBe(24 * 60 * 60 * 1000);
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
      failureCode: 'reverse_geocode_failed',
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
      error: 'reverse_geocode_failed',
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

  test('returns the durable footprint when the visibility preference update fails', async () => {
    const user = await createUser('private');
    jest.spyOn(User, 'findByIdAndUpdate').mockRejectedValueOnce(new Error('raw database details'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(footprintService.create(user._id, {
      lat: 31.23,
      lng: 121.47,
      visibility: 'public',
    }, { clock: () => now })).resolves.toMatchObject({ visibility: 'public' });

    expect(await Footprint.countDocuments({ userId: user._id })).toBe(1);
    expect(consoleError).toHaveBeenCalledWith('[FootprintService] Visibility preference update failed');
  });

  test('returns the durable footprint when streak maintenance fails', async () => {
    const user = await createUser();
    jest.spyOn(footprintService, '_updateStreak').mockRejectedValueOnce(new Error('raw streak details'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(footprintService.create(
      user._id,
      { lat: 31.23, lng: 121.47 },
      { clock: () => now },
    )).resolves.toMatchObject({ visibility: 'public' });

    expect(await Footprint.countDocuments({ userId: user._id })).toBe(1);
    expect(consoleError).toHaveBeenCalledWith('[FootprintService] Streak update failed');
  });

  test('emits an audience-safe footprint even when the publisher is an admin', async () => {
    const user = await createUser();
    const emit = jest.spyOn(bus, 'emit');

    const response = await footprintService.create(
      user._id,
      { lat: 31.23, lng: 121.47 },
      { isAdmin: true, clock: () => now },
    );

    const eventPayload = emit.mock.calls.find(([event]) => event === 'footprint:new')[1];
    expect(response.location).toEqual({ lat: 31.23, lng: 121.47 });
    expect(response.regionBackfill).toBeDefined();
    expect(eventPayload.footprint.location).not.toEqual({ lat: 31.23, lng: 121.47 });
    expect(eventPayload.footprint.regionBackfill).toBeUndefined();
  });

  test.each([
    ['rejects', () => Promise.reject(new Error('raw readback details'))],
    ['returns no document', () => Promise.resolve(null)],
  ])('returns and emits the durable footprint when post-create readback %s', async (_label, readback) => {
    const user = await createUser();
    jest.spyOn(Footprint, 'findById').mockReturnValueOnce({
      populate: jest.fn(readback),
    });
    const emit = jest.spyOn(bus, 'emit');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await footprintService.create(
      user._id,
      { lat: 31.23, lng: 121.47 },
      { clock: () => now },
    );

    const saved = await Footprint.findOne({ userId: user._id }).lean();
    const eventPayload = emit.mock.calls.find(([event]) => event === 'footprint:new')[1];
    expect(await Footprint.countDocuments({ userId: user._id })).toBe(1);
    expect(response._id.toString()).toBe(saved._id.toString());
    expect(response.regionBackfill).toBeUndefined();
    expect(eventPayload.footprint._id.toString()).toBe(saved._id.toString());
    expect(eventPayload.footprint.realLocation).toBeUndefined();
    expect(eventPayload.footprint.regionBackfill).toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith('[FootprintService] Post-create readback failed');
  });

  test('preserves the populated publication response on the normal path', async () => {
    const user = await createUser();

    const response = await footprintService.create(
      user._id,
      { lat: 31.23, lng: 121.47 },
      { clock: () => now },
    );

    expect(response.userId).toMatchObject({ name: user.name });
  });
});
