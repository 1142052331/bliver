import { describe, expect, it, vi } from 'vitest';
import { InMemoryOutbox, OutboxWorker } from '../index.js';

describe('outbox worker', () => {
  it('claims, processes once, and is idempotent for a repeated event', async () => {
    const outbox = new InMemoryOutbox();
    const process = vi.fn(async () => undefined);
    await outbox.append({ id: 'event-1', type: 'FootprintPublished', aggregateId: 'footprint-1', payload: {} });
    const worker = new OutboxWorker({ repository: outbox, process, now: () => 1_700_000_000 });
    await worker.runOnce();
    await worker.runOnce();
    expect(process).toHaveBeenCalledOnce();
  });

  it('retries failures with a deterministic schedule and dead-letters after the limit', async () => {
    const outbox = new InMemoryOutbox();
    await outbox.append({ id: 'event-2', type: 'FootprintPublished', aggregateId: 'footprint-2', payload: {} });
    let current = 1_700_000_000;
    const worker = new OutboxWorker({ repository: outbox, process: vi.fn(async () => { throw new Error('down'); }), now: () => current, maxAttempts: 2, baseDelayMs: 10 });
    await worker.runOnce();
    expect((await outbox.list())[0]?.attempts).toBe(1);
    current = 1_700_000_011;
    await outbox.advance(current);
    await worker.runOnce();
    expect((await outbox.list())[0]?.deadLetteredAt).toBeTruthy();
  });

  it('does not process events that are not yet available', async () => {
    const outbox = new InMemoryOutbox();
    await outbox.append({ id: 'event-3', type: 'FootprintPublished', aggregateId: 'footprint-3', payload: {}, availableAt: 1_700_000_100 });
    const process = vi.fn(async () => undefined);
    await new OutboxWorker({ repository: outbox, process, now: () => 1_700_000_000 }).runOnce();
    expect(process).not.toHaveBeenCalled();
  });
});
