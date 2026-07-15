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
  return { assets: assetRepository, idempotency: idempotencyRepository };
}
