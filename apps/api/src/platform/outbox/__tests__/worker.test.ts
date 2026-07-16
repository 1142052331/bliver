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

  it('reports backlog, retry and terminal failure from the worker boundary', async () => {
    const outbox = new InMemoryOutbox();
    const observe = vi.fn();
    await outbox.append({ id: 'event-observe', type: 'FootprintPublished', aggregateId: 'footprint-observe', payload: {} });
    await new OutboxWorker({ repository: outbox, process: async () => { throw new Error('down'); }, now: () => 100, maxAttempts: 1, observe }).runOnce();
    expect(observe.mock.calls.map(([kind]) => kind)).toEqual(['backlog', 'retry', 'failure']);
  });

  it('does not process events that are not yet available', async () => {
    const outbox = new InMemoryOutbox();
    await outbox.append({ id: 'event-3', type: 'FootprintPublished', aggregateId: 'footprint-3', payload: {}, availableAt: 1_700_000_100 });
    const process = vi.fn(async () => undefined);
    await new OutboxWorker({ repository: outbox, process, now: () => 1_700_000_000 }).runOnce();
    expect(process).not.toHaveBeenCalled();
  });

  it('reclaims a stale claim after a worker crash and increments attempts', async () => {
    const outbox = new InMemoryOutbox(30);
    await outbox.append({ id: 'event-stale', type: 'FootprintPublished', aggregateId: 'footprint-stale', payload: {} });

    await expect(outbox.claim(100)).resolves.toMatchObject({ attempts: 1, claimedAt: 100 });
    await expect(outbox.claim(129)).resolves.toBeNull();
    await expect(outbox.claim(130)).resolves.toMatchObject({ attempts: 2, claimedAt: 130 });
  });
  it('does not let a stale claim acknowledge a reclaimed event', async () => {
    const outbox = new InMemoryOutbox(30);
    await outbox.append({ id: 'event-claim', type: 'FootprintPublished', aggregateId: 'footprint-claim', payload: {} });
    const first = await outbox.claim(100);
    const second = await outbox.claim(130);
    await outbox.markProcessed('event-claim', first!.claimedAt, 131);
    expect((await outbox.list())[0]?.processedAt).toBeUndefined();
    await outbox.markProcessed('event-claim', second!.claimedAt, 132);
    expect((await outbox.list())[0]?.processedAt).toBe(132);
  });
});
