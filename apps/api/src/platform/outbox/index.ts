export interface OutboxEvent {
  readonly id: string;
  readonly type: string;
  readonly aggregateId: string;
  readonly payload: Record<string, unknown>;
  readonly availableAt?: number;
  readonly attempts?: number;
  readonly claimedAt?: number;
  readonly processedAt?: number;
  readonly lastError?: string;
  readonly deadLetteredAt?: number;
}

export interface ClaimedOutboxEvent extends OutboxEvent { readonly attempts: number; readonly claimedAt: number; }
export interface OutboxRepository {
  append(event: OutboxEvent): Promise<void>;
  claim(now: number): Promise<ClaimedOutboxEvent | null>;
  markProcessed(id: string, at: number): Promise<void>;
  markFailed(id: string, error: string, nextAvailableAt: number, deadLetteredAt?: number): Promise<void>;
}

export class InMemoryOutbox implements OutboxRepository {
  private readonly events = new Map<string, OutboxEvent>();
  private currentTime = 0;
  constructor(private readonly claimLeaseMs = 30_000) {}
  async append(event: OutboxEvent): Promise<void> { this.events.set(event.id, { ...event, availableAt: event.availableAt ?? this.currentTime, attempts: 0 }); }
  async claim(now: number): Promise<ClaimedOutboxEvent | null> {
    const event = [...this.events.values()].find((item) => !item.processedAt && !item.deadLetteredAt && (item.claimedAt === undefined || item.claimedAt <= now - this.claimLeaseMs) && (item.availableAt ?? 0) <= now);
    if (!event) return null;
    const claimed = { ...event, attempts: (event.attempts ?? 0) + 1, claimedAt: now } as ClaimedOutboxEvent;
    this.events.set(event.id, claimed);
    return claimed;
  }
  async markProcessed(id: string, at: number): Promise<void> { const event = this.events.get(id); if (event) this.events.set(id, { ...event, processedAt: at }); }
  async markFailed(id: string, error: string, nextAvailableAt: number, deadLetteredAt?: number): Promise<void> { const event = this.events.get(id); if (event) { const { claimedAt: _claimedAt, ...rest } = event; void _claimedAt; this.events.set(id, { ...rest, lastError: error, availableAt: nextAvailableAt, ...(deadLetteredAt ? { deadLetteredAt } : {}) }); } }
  async list(): Promise<OutboxEvent[]> { return [...this.events.values()]; }
  async advance(now: number): Promise<void> { this.currentTime = now; }
}

export class OutboxWorker {
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly seen = new Set<string>();
  constructor(private readonly options: { readonly repository: OutboxRepository; readonly process: (event: ClaimedOutboxEvent) => Promise<void>; readonly now?: () => number; readonly maxAttempts?: number; readonly baseDelayMs?: number }) { this.maxAttempts = options.maxAttempts ?? 5; this.baseDelayMs = options.baseDelayMs ?? 1_000; }
  async runOnce(): Promise<boolean> {
    const now = (this.options.now ?? (() => Date.now()))();
    const event = await this.options.repository.claim(now);
    if (!event) return false;
    if (this.seen.has(event.id)) { await this.options.repository.markProcessed(event.id, now); return true; }
    try { await this.options.process(event); this.seen.add(event.id); await this.options.repository.markProcessed(event.id, now); } catch (error) { const message = error instanceof Error ? error.message : 'processing failed'; const dead = event.attempts >= this.maxAttempts ? now : undefined; const next = dead ? now : now + this.baseDelayMs * (2 ** (event.attempts - 1)); await this.options.repository.markFailed(event.id, message, next, dead); }
    return true;
  }
}

export { createPostgresOutboxRepository } from './postgres-repository.js';
