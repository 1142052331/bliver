import { describe, expect, it, vi } from 'vitest';
import { createUserId } from '@bliver/domain';
import {
  FootprintConflictError,
  PublishFootprint,
  UpdateFootprintVisibility,
  DeleteFootprint,
  createMemoryFootprintRepositories,
  type FootprintProviderPorts,
} from '../index.js';

const ownerId = createUserId();
const point = { lat: 31.23, lng: 121.47 };

function providers(overrides: Partial<FootprintProviderPorts> = {}): FootprintProviderPorts {
  return {
    geocoding: { resolve: vi.fn(async () => ({ placeId: null, regionId: null })) },
    weather: { resolve: vi.fn(async () => ({ summary: null, temperature: null })) },
    ...overrides,
  };
}

describe('footprint application commands', () => {
  it('publishes a footprint and outbox event with a deterministic display point', async () => {
    const repositories = createMemoryFootprintRepositories();
    const publish = new PublishFootprint({ repositories, providers: providers() });

    const result = await publish.execute({
      actorId: ownerId,
      idempotencyKey: 'publish-1',
      message: 'Hello map',
      privatePoint: point,
      visibility: 'public',
      locationPrecision: 'approximate',
      mediaAssetIds: [],
    });

    expect(result.footprint.authorId).toBe(ownerId);
    expect(result.footprint.displayPoint).not.toEqual(point);
    expect(result.outbox.type).toBe('FootprintPublished');
    expect(result.outbox.payload.footprintId).toBe(result.footprint.id);
  });

  it('defaults public discovery expiry to one day after publication', async () => {
    const publishedAt = new Date('2026-07-15T12:00:00.000Z');
    const publish = new PublishFootprint({ repositories: createMemoryFootprintRepositories(), providers: providers(), now: () => publishedAt });
    const result = await publish.execute({ actorId: ownerId, idempotencyKey: 'publish-expiry', message: 'Discoverable', privatePoint: point, visibility: 'public', locationPrecision: 'precise', mediaAssetIds: [] });
    expect(result.footprint.discoveryExpiresAt?.getTime()).toBeGreaterThan(publishedAt.getTime());
    expect(result.footprint.discoveryExpiresAt?.toISOString()).toBe('2026-07-16T12:00:00.000Z');
  });

  it('preserves an explicitly null public discovery expiry', async () => {
    const publish = new PublishFootprint({ repositories: createMemoryFootprintRepositories(), providers: providers() });
    const input = { actorId: ownerId, idempotencyKey: 'publish-expiry-null', message: 'Not discoverable', privatePoint: point, visibility: 'public' as const, locationPrecision: 'precise' as const, mediaAssetIds: [], discoveryExpiresAt: null };
    const result = await publish.execute(input);
    expect(result.footprint.discoveryExpiresAt).toBeNull();
    const withoutExpiry = { actorId: input.actorId, idempotencyKey: input.idempotencyKey, message: input.message, privatePoint: input.privatePoint, visibility: input.visibility, locationPrecision: input.locationPrecision, mediaAssetIds: input.mediaAssetIds };
    await expect(publish.execute(withoutExpiry)).rejects.toBeInstanceOf(FootprintConflictError);
  });

  it('replays an idempotent publish and does not invoke providers twice', async () => {
    const repositories = createMemoryFootprintRepositories();
    const provider = providers();
    const publish = new PublishFootprint({ repositories, providers: provider });
    const input = { actorId: ownerId, idempotencyKey: 'publish-2', message: 'Replay', privatePoint: point, visibility: 'private' as const, locationPrecision: 'precise' as const, mediaAssetIds: [] };
    const first = await publish.execute(input);
    const second = await publish.execute(input);
    expect(second).toEqual(first);
    expect(provider.geocoding.resolve).toHaveBeenCalledOnce();
    await expect(publish.execute({ ...input, message: 'Different' })).rejects.toBeInstanceOf(FootprintConflictError);
  });

  it('publishes safely when enrichment providers fail', async () => {
    const repositories = createMemoryFootprintRepositories();
    const publish = new PublishFootprint({ repositories, providers: providers({ geocoding: { resolve: vi.fn(async () => { throw new Error('down'); }) }, weather: { resolve: vi.fn(async () => { throw new Error('down'); }) } }) });
    const result = await publish.execute({ actorId: ownerId, idempotencyKey: 'publish-3', message: 'Still publish', privatePoint: point, visibility: 'public', locationPrecision: 'precise', mediaAssetIds: [] });
    expect(result.footprint.metadata).toEqual({ placeId: null, regionId: null, weather: null });
  });

  it('falls back when enrichment providers exceed the bounded timeout', async () => {
    vi.useFakeTimers();
    try {
      const pending = <T,>(): Promise<T> => new Promise<T>(() => undefined);
      const publish = new PublishFootprint({
        repositories: createMemoryFootprintRepositories(),
        providers: providers({ geocoding: { resolve: () => pending<{ placeId: string | null; regionId: string | null }>() }, weather: { resolve: () => pending<unknown>() } }),
        providerTimeoutMs: 10,
      });
      const resultPromise = publish.execute({ actorId: ownerId, idempotencyKey: 'publish-timeout', message: 'Timeout fallback', privatePoint: point, visibility: 'public', locationPrecision: 'approximate', mediaAssetIds: [] });

      await vi.advanceTimersByTimeAsync(10);
      const result = await resultPromise;
      expect(result.footprint.metadata).toEqual({ placeId: null, regionId: null, weather: null });
    } finally {
      vi.useRealTimers();
    }
  });

  it('updates visibility and only the owner can delete', async () => {
    const repositories = createMemoryFootprintRepositories();
    const publish = new PublishFootprint({ repositories, providers: providers() });
    const created = await publish.execute({ actorId: ownerId, idempotencyKey: 'publish-4', message: 'Mutable', privatePoint: point, visibility: 'public', locationPrecision: 'precise', mediaAssetIds: [] });
    const update = new UpdateFootprintVisibility(repositories);
    await expect(update.execute({ actorId: ownerId, footprintId: created.footprint.id, visibility: 'friends' })).resolves.toMatchObject({ visibility: 'friends' });
    const deleteFootprint = new DeleteFootprint(repositories);
    await expect(deleteFootprint.execute({ actorId: createUserId(), footprintId: created.footprint.id })).rejects.toBeInstanceOf(FootprintConflictError);
    await expect(deleteFootprint.execute({ actorId: ownerId, footprintId: created.footprint.id })).resolves.toBeUndefined();
  });
});
