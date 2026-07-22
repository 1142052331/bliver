import { describe, expect, it } from 'vitest';

import { V2_BUDGETS } from './budgets.js';
import {
  bundleGzipBytes,
  classifyViteBundle,
  evaluateBundle,
  manifestJavaScriptAssets,
  type BundleAsset,
  type ViteManifest,
} from './bundle.js';
import { evaluateBrowserMetric, evaluateLighthouseReport, evaluatePerformanceBrowserEvidence, evaluateReleaseEvidence } from './run.js';
import { percentile } from './api-smoke.js';
import { inspectExplainPlan } from './map-query.js';
import { exerciseOutbox } from './outbox-lag.js';

describe('V2 performance gates', () => {
  it('keeps the canonical product budgets in one object', () => {
    expect(V2_BUDGETS).toMatchObject({
      initialShellJsGzipBytes: 160_000,
      spatialRuntimeJsGzipBytes: 500_000,
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

  it('classifies the initial shell and spatial increment from the Vite dependency graph', () => {
    const manifest: ViteManifest = {
      'index.html': {
        file: 'assets/index-12345678.js',
        name: 'index',
        isEntry: true,
        imports: ['_shared.js'],
        dynamicImports: ['_activity.js'],
        css: ['assets/index-12345678.css'],
      },
      '_activity.js': { file: 'assets/activity.route-12345678.js', name: 'activity.route' },
      '_shared.js': { file: 'assets/shared-12345678.js', name: 'shared' },
      '_spatial.js': { file: 'assets/dist-12345678.js', name: 'dist', imports: ['_shared.js'] },
      '_spatial-effect.js': { file: 'assets/spatial-effect-12345678.js', name: 'spatial-effect' },
      'src/app/routes/map.route.tsx': {
        file: 'assets/map.route-12345678.js',
        name: 'map.route',
        src: 'src/app/routes/map.route.tsx',
        isDynamicEntry: true,
        imports: ['index.html', '_spatial.js'],
        dynamicImports: ['_spatial-effect.js'],
        css: ['assets/map-12345678.css'],
      },
    };
    const indexHtml = `
      <script type="module" src="/assets/index-12345678.js"></script>
      <link rel="modulepreload" href="/assets/shared-12345678.js">
      <link rel="stylesheet" href="/assets/index-12345678.css">
    `;

    expect(classifyViteBundle(manifest, indexHtml)).toEqual({
      initialShellJsFiles: [
        'assets/index-12345678.js',
        'assets/shared-12345678.js',
      ],
      spatialIncrementJsFiles: [
        'assets/dist-12345678.js',
        'assets/map.route-12345678.js',
        'assets/spatial-effect-12345678.js',
      ],
      spatialIncrementFiles: [
        'assets/dist-12345678.js',
        'assets/map-12345678.css',
        'assets/map.route-12345678.js',
        'assets/spatial-effect-12345678.js',
      ],
      indexHtmlEagerFiles: [
        'assets/index-12345678.css',
        'assets/index-12345678.js',
        'assets/shared-12345678.js',
      ],
      mapRouteInInitialShell: false,
    });
  });

  it('enforces separate shell and spatial budgets without relying on chunk prefixes', () => {
    const assets: BundleAsset[] = [
      { logicalName: 'index.js', file: 'assets/index-a.js', gzipBytes: 150_000 },
      { logicalName: 'map.route.js', file: 'assets/map.route-b.js', gzipBytes: 300_000 },
      { logicalName: 'dist.js', file: 'assets/dist-c.js', gzipBytes: 190_000 },
    ];
    const classification = {
      initialShellJsFiles: ['assets/index-a.js'],
      spatialIncrementJsFiles: ['assets/map.route-b.js', 'assets/dist-c.js'],
      spatialIncrementFiles: ['assets/map.route-b.js', 'assets/dist-c.js'],
      indexHtmlEagerFiles: ['assets/index-a.js'],
      mapRouteInInitialShell: false,
    };
    const baseline = { 'index.js': 150_000, 'map.route.js': 300_000, 'dist.js': 190_000 };
    expect(evaluateBundle(assets, baseline, classification)).toEqual([]);

    const oversizedShell = [{ logicalName: 'index.js', file: 'assets/index-a.js', gzipBytes: 160_001 }];
    expect(evaluateBundle(oversizedShell, { 'index.js': 160_001 }, { ...classification, spatialIncrementJsFiles: [] })).toContainEqual(
      expect.stringContaining('initial shell JS'),
    );

    const oversizedSpatial = assets.map((asset) => asset.logicalName === 'dist.js' ? { ...asset, gzipBytes: 200_001 } : asset);
    expect(evaluateBundle(oversizedSpatial, { ...baseline, 'dist.js': 200_001 }, classification)).toContainEqual(
      expect.stringContaining('spatial runtime JS'),
    );

    const regressed = assets.map((asset) => asset.logicalName === 'index.js' ? { ...asset, gzipBytes: 155_001 } : asset);
    expect(evaluateBundle(regressed, { ...baseline, 'index.js': 140_000 }, classification)).toContainEqual(expect.stringContaining('baseline'));
  });

  it('rejects eager spatial assets even when their filenames do not start with map', () => {
    const assets: BundleAsset[] = [
      { logicalName: 'index.js', file: 'assets/index-a.js', gzipBytes: 100_000 },
      { logicalName: 'map.route.js', file: 'assets/map.route-b.js', gzipBytes: 300_000 },
      { logicalName: 'dist.js', file: 'assets/dist-c.js', gzipBytes: 100_000 },
    ];
    const baseline = { 'index.js': 100_000, 'map.route.js': 300_000, 'dist.js': 100_000 };
    const classification = {
      initialShellJsFiles: ['assets/index-a.js'],
      spatialIncrementJsFiles: ['assets/map.route-b.js', 'assets/dist-c.js'],
      spatialIncrementFiles: ['assets/map.route-b.js', 'assets/dist-c.js', 'assets/map-c.css'],
      indexHtmlEagerFiles: ['assets/index-a.js', 'assets/dist-c.js', 'assets/map-c.css'],
      mapRouteInInitialShell: false,
    };

    expect(evaluateBundle(assets, baseline, classification)).toEqual(expect.arrayContaining([
      expect.stringContaining('assets/dist-c.js'),
      expect.stringContaining('assets/map-c.css'),
    ]));
  });

  it('keeps duplicate logical chunk names in their physical dependency boundaries', () => {
    const manifest: ViteManifest = {
      'index.html': {
        file: 'assets/index-a.js',
        name: 'index',
        isEntry: true,
        imports: ['_api-auth.js'],
      },
      '_api-auth.js': { file: 'assets/api-auth-a.js', name: 'api' },
      '_api-auth-alias.js': { file: 'assets/api-auth-a.js', name: 'api' },
      '_api-identity.js': { file: 'assets/api-identity-b.js', name: 'api' },
      'src/app/routes/map.route.tsx': {
        file: 'assets/map.route-c.js',
        name: 'map.route',
        src: 'src/app/routes/map.route.tsx',
        isDynamicEntry: true,
        imports: ['index.html', '_api-identity.js'],
      },
    };

    expect(manifestJavaScriptAssets(manifest).filter(({ logicalName }) => logicalName === 'api.js')).toEqual([
      { key: '_api-auth.js', logicalName: 'api.js', file: 'assets/api-auth-a.js' },
      { key: '_api-identity.js', logicalName: 'api.js', file: 'assets/api-identity-b.js' },
    ]);
    expect(classifyViteBundle(manifest, '')).toMatchObject({
      initialShellJsFiles: ['assets/api-auth-a.js', 'assets/index-a.js'],
      spatialIncrementJsFiles: ['assets/api-identity-b.js', 'assets/map.route-c.js'],
    });
  });

  it('aggregates duplicate logical names for baselines without overwriting physical bytes', () => {
    const assets: BundleAsset[] = [
      { logicalName: 'index.js', file: 'assets/index-a.js', gzipBytes: 10 },
      { logicalName: 'api.js', file: 'assets/api-auth-a.js', gzipBytes: 40 },
      { logicalName: 'api.js', file: 'assets/api-identity-b.js', gzipBytes: 60 },
      { logicalName: 'translations.js', file: 'assets/translations-a.js', gzipBytes: 1 },
      { logicalName: 'translations.js', file: 'assets/translations-b.js', gzipBytes: 2 },
      { logicalName: 'translations.js', file: 'assets/translations-c.js', gzipBytes: 3 },
      { logicalName: 'translations.js', file: 'assets/translations-d.js', gzipBytes: 4 },
    ];
    const classification = {
      initialShellJsFiles: ['assets/index-a.js', 'assets/api-auth-a.js'],
      spatialIncrementJsFiles: ['assets/api-identity-b.js'],
      spatialIncrementFiles: ['assets/api-identity-b.js'],
      indexHtmlEagerFiles: ['assets/index-a.js', 'assets/api-auth-a.js'],
      mapRouteInInitialShell: false,
    };

    expect(bundleGzipBytes(assets, [...classification.initialShellJsFiles, 'assets/api-auth-a.js'])).toBe(50);
    expect(bundleGzipBytes([...assets, assets[1]!], classification.initialShellJsFiles)).toBe(50);
    expect(evaluateBundle(assets, {
      'index.js': 10,
      'api.js': 100,
      'translations.js': 10,
    }, classification)).toEqual([]);

    const regressed = [...assets, {
      logicalName: 'api.js',
      file: 'assets/api-third-hash.js',
      gzipBytes: 11,
    }];
    expect(evaluateBundle(regressed, {
      'index.js': 10,
      'api.js': 100,
      'translations.js': 10,
    }, classification).filter((failure) => failure.startsWith('api.js exceeds'))).toHaveLength(1);

    expect(evaluateBundle(assets, {
      'index.js': 10,
      'api.js': 100,
    }, classification).filter((failure) => failure === 'translations.js is missing a baseline entry')).toHaveLength(1);
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

  it('requires complete isolated browser evidence in every performance run', () => {
    const missing = evaluatePerformanceBrowserEvidence({ failures: ['browser evidence manifest is missing'], reconnectValues: [], inpValues: [] });
    expect(missing.failures).toEqual(expect.arrayContaining([
      expect.stringContaining('manifest'),
      expect.stringContaining('Reconnect resync'),
      expect.stringContaining('INP'),
    ]));

    expect(evaluatePerformanceBrowserEvidence({ failures: [], reconnectValues: [40, 50, 60, 70], inpValues: [30, 40, 50, 60] })).toMatchObject({
      failures: [],
      reconnect: { skipped: false, valueMs: 70 },
      inp: { skipped: false, valueMs: 60 },
    });
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
