import { InMemoryOutbox, OutboxWorker } from '../../apps/api/src/platform/outbox/index.js';
import { V2_BUDGETS } from './budgets.js';

export interface OutboxMetric {
  readonly processed: number;
  readonly attempts: number;
  readonly lagMs: number;
}

export async function exerciseOutbox(): Promise<OutboxMetric> {
  const queuedAt = 0;
  let current = queuedAt;
  let processed = 0;
  const outbox = new InMemoryOutbox();
  await outbox.append({ id: 'phase7-outbox-event', type: 'Phase7Fixture', aggregateId: 'phase7', payload: {}, availableAt: queuedAt });
  const worker = new OutboxWorker({
    repository: outbox,
    now: () => current,
    baseDelayMs: 1_000,
    process: async (event) => {
      if (event.attempts === 1) throw new Error('deterministic retry');
      processed += 1;
    },
  });
  await worker.runOnce();
  current = 2_000;
  await outbox.advance(current);
  await worker.runOnce();
  const event = (await outbox.list())[0];
  return { processed, attempts: event?.attempts ?? 0, lagMs: current - queuedAt };
}

export async function runOutboxCheck(): Promise<{ readonly metric: OutboxMetric; readonly failures: readonly string[] }> {
  const metric = await exerciseOutbox();
  const failures: string[] = [];
  if (metric.processed !== 1 || metric.attempts !== 2) failures.push('Outbox deterministic retry did not process exactly once on the second attempt');
  if (metric.lagMs > V2_BUDGETS.maxOutboxLagMs) failures.push(`Outbox lag ${metric.lagMs}ms exceeds ${V2_BUDGETS.maxOutboxLagMs}ms`);
  return { metric, failures };
}
