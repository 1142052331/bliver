import { describe, expect, it } from 'vitest';

import { V2_BUDGETS } from './budgets.js';
import { evaluateBrowserMetric, evaluateBundle, evaluateLighthouseReport, evaluateReleaseEvidence, type BundleAsset } from './run.js';
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
    const metric = await exerciseOutbox();
    expect(metric).toMatchObject({ processed: 1, attempts: 2, lagMs: 2_000 });
    expect(metric).not.toHaveProperty('reconnectResyncMs');
  });

  it('requires real browser evidence in release mode and enforces its budget', () => {
    expect(evaluateBrowserMetric('Reconnect resync', [], 300, true).failures).toContainEqual(expect.stringContaining('missing'));
    expect(evaluateBrowserMetric('Reconnect resync', [], 300, false)).toMatchObject({ failures: [], skipped: true });
    expect(evaluateBrowserMetric('Reconnect resync', [301], 300, true).failures).toContainEqual(expect.stringContaining('exceeds'));
    expect(evaluateBrowserMetric('Reconnect resync', [120, 180], 300, true)).toMatchObject({ failures: [], skipped: false, valueMs: 180 });
  });

  it('requires Lighthouse LCP and CLS from an actual report', () => {
    expect(evaluateLighthouseReport({ audits: {} })).toEqual(expect.arrayContaining([expect.stringContaining('LCP'), expect.stringContaining('CLS')]));
    expect(evaluateLighthouseReport({ audits: {
      'largest-contentful-paint': { numericValue: 2_000 },
      'cumulative-layout-shift': { numericValue: 0.05 },
    } })).toEqual([]);
  });

  it('does not allow release mode to pass without live PostGIS or Lighthouse evidence', () => {
    expect(evaluateReleaseEvidence({ livePostgis: false, lighthouseReport: false }, true)).toEqual(expect.arrayContaining([
      expect.stringContaining('PostGIS'),
      expect.stringContaining('Lighthouse'),
    ]));
    expect(evaluateReleaseEvidence({ livePostgis: false, lighthouseReport: false }, false)).toEqual([]);
  });
});
