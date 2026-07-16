import { createServer } from 'node:http';
import pino from 'pino';

import { createApp } from '../../apps/api/src/http/app.js';
import { V2_BUDGETS } from './budgets.js';

const SAMPLE_COUNT = 12;

export interface ApiMetric {
  readonly name: string;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly errorRate: number;
}

export function percentile(values: readonly number[], rank: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * rank) - 1)] ?? 0;
}

export async function runApiSmoke(): Promise<{ readonly metrics: readonly ApiMetric[]; readonly failures: readonly string[] }> {
  const app = createApp({
    config: {
      nodeEnv: 'test', deployEnv: 'test', releaseSha: 'phase7-perf', databaseUrl: 'postgres://unused',
      sessionSecret: 'phase7-performance-fixture-secret', port: 0, cloudinary: undefined, push: undefined,
    },
    logger: pino({ level: 'silent' }),
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Performance server address is unavailable');
  const base = `http://127.0.0.1:${address.port}`;
  const checks = [
    { name: 'map', path: '/api/v1/map/footprints?west=121&south=31&east=122&north=32&limit=20', method: 'GET', expected: 200, budget: V2_BUDGETS.mapApiP95Ms },
    { name: 'activity', path: '/api/v1/activity?scope=global&relationship=all&content=all&limit=20', method: 'GET', expected: 400, budget: V2_BUDGETS.mapApiP95Ms },
    { name: 'publish', path: '/api/v1/footprints', method: 'POST', expected: 401, budget: V2_BUDGETS.commandApiP95Ms },
    { name: 'comments', path: '/api/v1/footprints/019f0000-0000-7000-8000-000000000711/comments', method: 'GET', expected: 200, budget: V2_BUDGETS.commandApiP95Ms },
    { name: 'conversations', path: '/api/v1/conversations', method: 'GET', expected: 401, budget: V2_BUDGETS.commandApiP95Ms },
    { name: 'notifications', path: '/api/v1/notifications', method: 'GET', expected: 401, budget: V2_BUDGETS.commandApiP95Ms },
  ] as const;
  const metrics: ApiMetric[] = [];
  const failures: string[] = [];
  try {
    for (const check of checks) {
      const durations: number[] = [];
      let errors = 0;
      for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
        const started = performance.now();
        try {
          const response = await fetch(`${base}${check.path}`, {
            method: check.method,
            ...(check.method === 'POST' ? { headers: { 'content-type': 'application/json' }, body: '{}' } : {}),
          });
          if (response.status !== check.expected) errors += 1;
          await response.arrayBuffer();
        } catch { errors += 1; }
        durations.push(performance.now() - started);
      }
      const metric = {
        name: check.name,
        p50Ms: percentile(durations, 0.5),
        p95Ms: percentile(durations, 0.95),
        errorRate: errors / SAMPLE_COUNT,
      };
      metrics.push(metric);
      if (metric.p95Ms > check.budget) failures.push(`${check.name} p95 ${metric.p95Ms.toFixed(1)}ms exceeds ${check.budget}ms`);
      if (metric.errorRate > V2_BUDGETS.maxApiErrorRate) failures.push(`${check.name} error rate ${metric.errorRate} exceeds ${V2_BUDGETS.maxApiErrorRate}`);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  return { metrics, failures };
}
