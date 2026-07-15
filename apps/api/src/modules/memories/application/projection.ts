import type { FootprintId, UserId } from '@bliver/domain';
import type { MemoryProjectionEvent, MemoryRecordSource } from '../domain/ports.js';

export interface MemoryProjectionRepository extends MemoryRecordSource { upsertFootprint?(record: unknown): Promise<void>; markEvent?(eventId: string): Promise<boolean>; recordVisitor?(ownerId: UserId, visitorId: UserId): Promise<void>; }
export class MemoryProjectionConsumer {
  private readonly seen = new Set<string>();
  constructor(private readonly repository: MemoryProjectionRepository) {}
  async process(event: MemoryProjectionEvent): Promise<void> {
    if (this.seen.has(event.id)) return;
    if (this.repository.markEvent && !(await this.repository.markEvent(event.id))) { this.seen.add(event.id); return; }
    const payload = event.payload;
    if ((event.type === 'FootprintPublished' || event.type === 'FootprintVisibilityChanged' || event.type === 'FootprintVisibilityUpdated') && this.repository.upsertFootprint) await this.repository.upsertFootprint(payload);
    if (event.type === 'ProfileVisited' && this.repository.recordVisitor) await this.repository.recordVisitor(String(payload.ownerId) as UserId, String(payload.visitorId) as UserId);
    if ((event.type === 'CommentAdded' || event.type === 'ReactionAdded') && this.repository.upsertFootprint) await this.repository.upsertFootprint({ id: payload.footprintId as FootprintId });
    this.seen.add(event.id);
  }
}
