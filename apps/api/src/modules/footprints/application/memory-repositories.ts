import type { FootprintIdempotencyRepository, FootprintOutboxEvent, FootprintOutboxRepository, FootprintRecord, FootprintRepositories, FootprintRepository, PublishFootprintResult } from './commands.js';

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
  return { footprints, outbox, idempotency };
}
