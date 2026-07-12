const { connectDB, disconnectDB, clearDB } = require('./setup');
const BackfillDiscoveryWindow = require('../models/BackfillDiscoveryWindow');
const { createBackfillDiscoveryWindowService } = require('../services/BackfillDiscoveryWindowService');

describe('BackfillDiscoveryWindowService', () => {
  const now = new Date('2026-07-12T08:00:00.000Z');

  beforeAll(connectDB);
  afterAll(disconnectDB);
  beforeEach(clearDB);

  test('acquires an opaque window, reuses it while active, and replaces it after expiry', async () => {
    const tokens = ['window-a', 'window-b'];
    const service = createBackfillDiscoveryWindowService({
      Window: BackfillDiscoveryWindow,
      tokenFactory: () => tokens.shift(),
      maxActiveWindows: 2,
    });

    const first = await service.acquire({ now });
    expect(first).toMatchObject({ token: 'window-a', expiresAt: new Date(+now + 24 * 60 * 60 * 1000) });
    await expect(service.acquire({ token: first.token, now })).resolves.toMatchObject({ token: 'window-a' });
    await expect(service.acquire({ token: first.token, now: first.expiresAt })).resolves.toMatchObject({ token: 'window-b' });
  });

  test('fails safely when the active-window cap is reached', async () => {
    const tokens = ['window-a', 'window-b'];
    const service = createBackfillDiscoveryWindowService({
      Window: BackfillDiscoveryWindow,
      tokenFactory: () => tokens.shift(),
      maxActiveWindows: 1,
    });

    await service.acquire({ now });
    await expect(service.acquire({ now })).rejects.toThrow('active discovery window limit');
    expect(await BackfillDiscoveryWindow.countDocuments()).toBe(1);
  });

  test('enforces the 32-window cap across 64 concurrent acquisition attempts', async () => {
    const tokens = Array.from({ length: 64 }, (_, index) => `window-${index}`);
    const service = createBackfillDiscoveryWindowService({
      Window: BackfillDiscoveryWindow,
      tokenFactory: () => tokens.shift(),
    });

    const results = await Promise.allSettled(
      Array.from({ length: 64 }, () => service.acquire({ now })),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(32);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(32);
    expect(await BackfillDiscoveryWindow.countDocuments()).toBe(32);
  });

  test('requires an integer window slot within the fixed 0 through 31 range', async () => {
    const base = { token: 'slot-window', createdAt: now, expiresAt: new Date(+now + 1000) };

    await expect(BackfillDiscoveryWindow.create(base))
      .rejects.toThrow(/slot/);
    await expect(BackfillDiscoveryWindow.create({ ...base, slot: -1 }))
      .rejects.toThrow(/slot/);
    await expect(BackfillDiscoveryWindow.create({ ...base, token: 'slot-window-high', slot: 32 }))
      .rejects.toThrow(/slot/);
    await expect(BackfillDiscoveryWindow.create({ ...base, token: 'slot-window-decimal', slot: 1.5 }))
      .rejects.toThrow(/slot/);
    await expect(BackfillDiscoveryWindow.create({ ...base, token: 'slot-window-low', slot: 0 }))
      .resolves.toMatchObject({ slot: 0 });
    await expect(BackfillDiscoveryWindow.create({ ...base, token: 'slot-window-max', slot: 31 }))
      .resolves.toMatchObject({ slot: 31 });
  });
});
