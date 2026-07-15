import { FootprintConflictError, type FootprintIdempotencyRepository, type FootprintOutboxEvent, type FootprintOutboxRepository, type FootprintRecord, type FootprintRepositories, type FootprintRepository, type FootprintTransactionPort, type PublishFootprintResult } from './commands.js';

export function createMemoryFootprintRepositories(): FootprintRepositories {
  const records = new Map<string, FootprintRecord>();
  const events: FootprintOutboxEvent[] = [];
  const idem = new Map<string, { fingerprint: string; result: PublishFootprintResult }>();
  const footprints: FootprintRepository = {
    async findById(id) { return records.get(id) ?? null; },
    async create(record) { records.set(record.id, record); },
    async updateVisibility(id, visibility) { const record = records.get(id); if (!record) return null; const updated = { ...record, visibility }; records.set(id, updated); return updated; },
    async delete(id) { records.delete(id); },
  };
  const outbox: FootprintOutboxRepository = { async append(event) { events.push(event); }, async list() { return [...events]; } };
  const idempotency: FootprintIdempotencyRepository = { async find(actorId, key) { return idem.get(`${actorId}:${key}`) ?? null; }, async save(actorId, key, fingerprint, result) { idem.set(`${actorId}:${key}`, { fingerprint, result }); } };
  const transactions: FootprintTransactionPort = {
    async commitPublish(input) {
      const prior = idem.get(`${input.actorId}:${input.idempotencyKey}`);
      if (prior) { if (prior.fingerprint !== input.fingerprint) throw new FootprintConflictError(); return prior.result; }
      records.set(input.footprint.id, input.footprint);
      try { await outbox.append(input.outbox); } catch (error) { records.delete(input.footprint.id); throw error; }
      const result = { footprint: input.footprint, outbox: input.outbox };
      idem.set(`${input.actorId}:${input.idempotencyKey}`, { fingerprint: input.fingerprint, result });
      return result;
    },
    async updateVisibility(input) { const record = records.get(input.footprintId); if (!record || record.authorId !== input.actorId) throw new FootprintConflictError(); const updated = { ...record, visibility: input.visibility }; records.set(input.footprintId, updated); await outbox.append({ id: 'visibility-event', type: 'FootprintVisibilityUpdated', aggregateId: input.footprintId, payload: { footprintId: input.footprintId, visibility: input.visibility } }); return updated; },
    async delete(input) { const record = records.get(input.footprintId); if (!record || record.authorId !== input.actorId) throw new FootprintConflictError(); records.delete(input.footprintId); await outbox.append({ id: 'delete-event', type: 'FootprintDeleted', aggregateId: input.footprintId, payload: { footprintId: input.footprintId } }); },
  };
  return { footprints, outbox, idempotency, transactions, mediaOwnership: { async assertOwned() { return undefined; } }, publicDetails: { async findById(id) { const record = records.get(id); return record ? { id: record.id, authorId: record.authorId, author: { name: String(record.authorId) }, displayPoint: record.displayPoint, visibility: record.visibility, locationPrecision: record.locationPrecision, publishedAt: record.publishedAt, discoveryExpiresAt: record.discoveryExpiresAt, message: record.message } : null; } } };
}
