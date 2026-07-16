import { describe, expect, it } from 'vitest';

import { V2_BUDGETS } from './budgets.js';
import { evaluateBundle, type BundleAsset } from './run.js';
import { percentile } from './api-smoke.js';
import { inspectExplainPlan } from './map-query.js';
import { exerciseOutbox } from './outbox-lag.js';

describe('V2 performance gates', () => {
  it('keeps the canonical product budgets in one object', () => {
    expect(V2_BUDGETS).toMatchObject({
      initialNonMapJsGzipBytes: 200_000,
      lcpMs: 2_500,
      inpMs: 200,
      cls: 0.1,
      mapApiP95Ms: 400,
      commandApiP95Ms: 300,
      maxOutboxLagMs: 5_000,
    });
  });

  it('calculates deterministic nearest-rank percentiles', () => {
    expect(percentile([9, 1, 5, 2, 4], 0.5)).toBe(4);
    expect(percentile([9, 1, 5, 2, 4], 0.95)).toBe(9);
  });

  it('excludes named map chunks and rejects unapproved bundle regressions', () => {
    const assets: BundleAsset[] = [
      { name: 'index.js', gzipBytes: 150_000 },
      { name: 'map-vendor.js', gzipBytes: 90_000 },
    ];
    expect(evaluateBundle(assets, { 'index.js': 150_000, 'map-vendor.js': 90_000 })).toEqual([]);
    expect(evaluateBundle([{ name: 'index.js', gzipBytes: 210_000 }], { 'index.js': 150_000 })).toContainEqual(
      expect.stringContaining('initial non-map JS'),
    );
    expect(evaluateBundle([{ name: 'index.js', gzipBytes: 170_000 }], { 'index.js': 150_000 })).toContainEqual(
      expect.stringContaining('baseline'),
    );
  });

  it('rejects sequential scans above the approved fixture threshold', () => {
    expect(inspectExplainPlan({ 'Node Type': 'Index Scan', 'Plan Rows': 20, Plans: [] })).toEqual([]);
    expect(inspectExplainPlan({ 'Node Type': 'Seq Scan', 'Plan Rows': 5_001, 'Relation Name': 'footprints' })).toContainEqual(
      expect.stringContaining('footprints'),
    );
  });

  it('keeps deterministic outbox lag and retry under budget', async () => {
    await expect(exerciseOutbox()).resolves.toMatchObject({ processed: 1, attempts: 2, lagMs: 2_000 });
  });
});
