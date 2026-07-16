import { afterEach, describe, expect, it, vi } from 'vitest';

import { OutboxWorkerPump } from '../pump.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('Outbox worker pump', () => {
  afterEach(() => vi.useRealTimers());

  it('never overlaps interval ticks', async () => {
    vi.useFakeTimers();
    const firstRun = deferred<boolean>();
    const runOnce = vi.fn(() => firstRun.promise);
    const pump = new OutboxWorkerPump({ worker: { runOnce }, intervalMs: 10 });

    pump.start();
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(50);
    expect(runOnce).toHaveBeenCalledOnce();

    firstRun.resolve(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(runOnce).toHaveBeenCalledTimes(2);
    await pump.stop();
  });

  it('handles and observes rejected worker ticks', async () => {
    vi.useFakeTimers();
    const failure = new Error('worker unavailable');
    const observeError = vi.fn();
    const pump = new OutboxWorkerPump({
      worker: { runOnce: vi.fn(async () => { throw failure; }) },
      intervalMs: 10,
      observeError,
    });

    pump.start();
    await vi.advanceTimersByTimeAsync(10);

    expect(observeError).toHaveBeenCalledWith(failure);
    await expect(pump.stop()).resolves.toBeUndefined();
  });

  it('waits for an in-flight worker tick during stop', async () => {
    vi.useFakeTimers();
    const activeRun = deferred<boolean>();
    const pump = new OutboxWorkerPump({ worker: { runOnce: () => activeRun.promise }, intervalMs: 10 });
    pump.start();
    await vi.advanceTimersByTimeAsync(10);

    let stopped = false;
    const stopping = pump.stop().then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);

    activeRun.resolve(false);
    await stopping;
    expect(stopped).toBe(true);
  });
});
