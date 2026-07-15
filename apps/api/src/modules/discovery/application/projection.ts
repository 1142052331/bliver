import type { FootprintOutboxEvent } from '../../footprints/application/commands.js';
import type { DiscoveryEntry, DiscoveryRepository } from './ports.js';

export interface DiscoveryProjectionSource { findById(id: string): Promise<DiscoveryEntry | null>; }

export class DiscoveryProjectionConsumer {
  private readonly processed = new Set<string>();
  constructor(private readonly options: { repository: DiscoveryRepository; source: DiscoveryProjectionSource }) {}
  async process(event: FootprintOutboxEvent): Promise<void> {
    if (this.processed.has(event.id)) return;
    if (event.type === 'FootprintDeleted') await this.options.repository.remove(event.aggregateId);
    else {
      const entry = await this.options.source.findById(event.aggregateId);
      if (entry) await this.options.repository.upsert(entry);
      else await this.options.repository.remove(event.aggregateId);
    }
    this.processed.add(event.id);
  }
}
