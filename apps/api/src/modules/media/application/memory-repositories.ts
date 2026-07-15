import type {
  MediaAsset,
  MediaAssetRepository,
  MediaIdempotencyRecord,
  MediaIdempotencyRepository,
  MediaRepositories,
} from './ports.js';

export function createMemoryMediaRepositories(): MediaRepositories {
  const assets = new Map<string, MediaAsset>();
  const idempotency = new Map<string, MediaIdempotencyRecord>();
  const assetRepository: MediaAssetRepository = {
    async findById(assetId) {
      return assets.get(assetId) ?? null;
    },
    async create(asset) {
      assets.set(asset.assetId, asset);
    },
    async updateMetadata(assetId, metadata) {
      const existing = assets.get(assetId);
      if (existing) assets.set(assetId, { ...existing, ...metadata });
    },
    async delete(assetId) {
      assets.delete(assetId);
    },
  };
  const idempotencyRepository: MediaIdempotencyRepository = {
    async find(actorId, key) {
      return idempotency.get(`${actorId}:${key}`) ?? null;
    },
    async save(record) {
      idempotency.set(`${record.actorId}:${record.key}`, record);
    },
  };
  return { assets: assetRepository, idempotency: idempotencyRepository, transactions: { async commitSignature(input) { const prior = idempotency.get(`${input.actorId}:${input.key}`); if (prior && prior.fingerprint !== input.fingerprint) throw new Error('IDEMPOTENCY_CONFLICT'); if (prior) return prior.result; assets.set(input.asset.assetId, input.asset); idempotency.set(`${input.actorId}:${input.key}`, { actorId: input.actorId, key: input.key, fingerprint: input.fingerprint, result: input.result }); return input.result; } } };
}
