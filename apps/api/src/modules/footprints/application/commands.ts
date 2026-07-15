import { createDisplayPoint, type GeoPoint, type LocationPrecision } from '../domain/location-privacy.js';
import type { FootprintPolicyInput } from '../domain/visibility-policy.js';
import type { FootprintId, UserId, Visibility } from '@bliver/domain';
import { createEventId, createFootprintId } from '@bliver/domain';

export interface FootprintRecord {
  readonly id: FootprintId;
  readonly authorId: UserId;
  readonly privatePoint: GeoPoint;
  readonly displayPoint: GeoPoint;
  readonly visibility: Visibility;
  readonly locationPrecision: LocationPrecision;
  readonly message: string;
  readonly mood?: string;
  readonly mediaAssetIds: readonly string[];
  readonly metadata: { readonly placeId: string | null; readonly regionId: string | null; readonly weather: unknown | null };
  readonly publishedAt: Date;
  readonly discoveryExpiresAt: Date | null;
}

export interface FootprintOutboxEvent {
  readonly id: string;
  readonly type: 'FootprintPublished' | 'FootprintVisibilityUpdated' | 'FootprintDeleted';
  readonly aggregateId: FootprintId;
  readonly payload: Record<string, unknown>;
}

export interface FootprintRepository {
  findById(id: FootprintId): Promise<FootprintRecord | null>;
  create(record: FootprintRecord): Promise<void>;
  updateVisibility(id: FootprintId, visibility: Visibility): Promise<FootprintRecord | null>;
  delete(id: FootprintId): Promise<void>;
}

export interface FootprintOutboxRepository {
  append(event: FootprintOutboxEvent): Promise<void>;
  list(): Promise<FootprintOutboxEvent[]>;
}

export interface FootprintIdempotencyRepository {
  find(actorId: UserId, key: string): Promise<{ fingerprint: string; result: PublishFootprintResult } | null>;
  save(actorId: UserId, key: string, fingerprint: string, result: PublishFootprintResult): Promise<void>;
}

export interface FootprintRepositories {
  readonly footprints: FootprintRepository;
  readonly outbox: FootprintOutboxRepository;
  readonly idempotency: FootprintIdempotencyRepository;
  readonly mediaOwnership?: MediaOwnershipPort;
  readonly transactions?: FootprintTransactionPort;
  readonly publicDetails?: { findById(id: FootprintId): Promise<(FootprintPolicyInput & { readonly message: string }) | null> };
}

export interface MediaOwnershipPort { assertOwned(actorId: UserId, assetIds: readonly string[]): Promise<void>; }
export interface FootprintTransactionPort {
  commitPublish(input: { readonly actorId: UserId; readonly idempotencyKey: string; readonly fingerprint: string; readonly footprint: FootprintRecord; readonly outbox: FootprintOutboxEvent }): Promise<PublishFootprintResult>;
  updateVisibility(input: { readonly actorId: UserId; readonly footprintId: FootprintId; readonly visibility: Visibility }): Promise<FootprintRecord>;
  delete(input: { readonly actorId: UserId; readonly footprintId: FootprintId }): Promise<void>;
}

export interface GeocodingPort { resolve(point: GeoPoint): Promise<{ placeId: string | null; regionId: string | null }>; }
export interface WeatherPort { resolve(point: GeoPoint): Promise<unknown>; }
export interface FootprintProviderPorts { readonly geocoding: GeocodingPort; readonly weather: WeatherPort; }

export interface PublishFootprintInput {
  readonly actorId: UserId;
  readonly idempotencyKey: string;
  readonly message: string;
  readonly mood?: string;
  readonly privatePoint: GeoPoint;
  readonly visibility: Visibility;
  readonly locationPrecision: LocationPrecision;
  readonly mediaAssetIds: readonly string[];
  readonly discoveryExpiresAt?: Date | null;
}

export interface PublishFootprintResult { readonly footprint: FootprintRecord; readonly outbox: FootprintOutboxEvent; }

export class FootprintConflictError extends Error {
  readonly code = 'FOOTPRINT_CONFLICT';
  constructor() { super('Footprint conflict'); this.name = 'FootprintConflictError'; }
}

async function bounded<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('provider timeout')), timeoutMs))]);
}

function publishFingerprint(input: PublishFootprintInput): string {
  return JSON.stringify({ message: input.message, mood: input.mood ?? null, privatePoint: input.privatePoint, visibility: input.visibility, locationPrecision: input.locationPrecision, mediaAssetIds: input.mediaAssetIds, discoveryExpiresAt: input.discoveryExpiresAt?.toISOString() ?? null });
}

export class PublishFootprint {
  private readonly timeoutMs: number;
  constructor(private readonly options: { readonly repositories: FootprintRepositories; readonly providers: FootprintProviderPorts; readonly now?: () => Date; readonly providerTimeoutMs?: number }) {
    this.timeoutMs = options.providerTimeoutMs ?? 2_000;
  }

  async execute(input: PublishFootprintInput): Promise<PublishFootprintResult> {
    const key = input.idempotencyKey.trim();
    if (!key) throw new FootprintConflictError();
    const fingerprint = publishFingerprint(input);
    const prior = await this.options.repositories.idempotency.find(input.actorId, key);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new FootprintConflictError();
      return prior.result;
    }
    const now = this.options.now ?? (() => new Date());
    const id = createFootprintId();
    const [geocoding, weather] = await Promise.all([
      bounded(this.options.providers.geocoding.resolve(input.privatePoint), this.timeoutMs).catch(() => ({ placeId: null, regionId: null })),
      bounded(this.options.providers.weather.resolve(input.privatePoint), this.timeoutMs).catch(() => null),
    ]);
    const publishedAt = now();
    const footprint: FootprintRecord = {
      id,
      authorId: input.actorId,
      privatePoint: { ...input.privatePoint },
      displayPoint: createDisplayPoint({ footprintId: id, authorId: input.actorId, privatePoint: input.privatePoint, locationPrecision: input.locationPrecision }),
      visibility: input.visibility,
      locationPrecision: input.locationPrecision,
      message: input.message,
      ...(input.mood ? { mood: input.mood } : {}),
      mediaAssetIds: [...input.mediaAssetIds],
      metadata: { placeId: geocoding.placeId, regionId: geocoding.regionId, weather },
      publishedAt,
      discoveryExpiresAt: input.discoveryExpiresAt ?? null,
    };
    const outbox: FootprintOutboxEvent = { id: createEventId(), type: 'FootprintPublished', aggregateId: id, payload: { footprintId: id, authorId: input.actorId } };
    if (this.options.repositories.mediaOwnership) await this.options.repositories.mediaOwnership.assertOwned(input.actorId, input.mediaAssetIds);
    if (this.options.repositories.transactions) return this.options.repositories.transactions.commitPublish({ actorId: input.actorId, idempotencyKey: key, fingerprint, footprint, outbox });
    await this.options.repositories.footprints.create(footprint);
    try {
      await this.options.repositories.outbox.append(outbox);
    } catch (error) {
      await this.options.repositories.footprints.delete(id);
      throw error;
    }
    const result = { footprint, outbox };
    await this.options.repositories.idempotency.save(input.actorId, key, fingerprint, result);
    return result;
  }
}

export class UpdateFootprintVisibility {
  constructor(private readonly repositories: FootprintRepositories) {}
  async execute(input: { readonly actorId: UserId; readonly footprintId: FootprintId; readonly visibility: Visibility }): Promise<FootprintRecord> {
    const existing = await this.repositories.footprints.findById(input.footprintId);
    if (!existing || existing.authorId !== input.actorId) throw new FootprintConflictError();
    if (this.repositories.transactions) return this.repositories.transactions.updateVisibility(input);
    const updated = await this.repositories.footprints.updateVisibility(input.footprintId, input.visibility);
    if (!updated) throw new FootprintConflictError();
    await this.repositories.outbox.append({ id: createEventId(), type: 'FootprintVisibilityUpdated', aggregateId: input.footprintId, payload: { footprintId: input.footprintId, visibility: input.visibility } });
    return updated;
  }
}

export class DeleteFootprint {
  constructor(private readonly repositories: FootprintRepositories) {}
  async execute(input: { readonly actorId: UserId; readonly footprintId: FootprintId }): Promise<void> {
    const existing = await this.repositories.footprints.findById(input.footprintId);
    if (!existing || existing.authorId !== input.actorId) throw new FootprintConflictError();
    if (this.repositories.transactions) { await this.repositories.transactions.delete(input); return; }
    await this.repositories.footprints.delete(input.footprintId);
    await this.repositories.outbox.append({ id: createEventId(), type: 'FootprintDeleted', aggregateId: input.footprintId, payload: { footprintId: input.footprintId } });
  }
}
