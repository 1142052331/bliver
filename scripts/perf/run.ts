import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

import { runApiSmoke } from './api-smoke.js';
import { V2_BUDGETS } from './budgets.js';
import { runMapQueryCheck } from './map-query.js';
import { runOutboxCheck } from './outbox-lag.js';

export interface BundleAsset { readonly name: string; readonly gzipBytes: number; }

function canonicalAssetName(name: string): string {
  const stem = name.endsWith('.js') ? name.slice(0, -3) : name;
  const separator = stem.lastIndexOf('-');
  const hash = separator >= 0 ? stem.slice(separator + 1) : '';
  return separator >= 0 && hash.length >= 8 && /^[A-Za-z0-9_]+$/.test(hash)
    ? `${stem.slice(0, separator)}.js`
    : name;
}

export function evaluateBundle(assets: readonly BundleAsset[], baseline: Readonly<Record<string, number>>): readonly string[] {
  const failures: string[] = [];
  const nonMapBytes = assets.filter((asset) => !asset.name.startsWith('map-')).reduce((total, asset) => total + asset.gzipBytes, 0);
  if (nonMapBytes > V2_BUDGETS.initialNonMapJsGzipBytes) failures.push(`initial non-map JS ${nonMapBytes} bytes exceeds ${V2_BUDGETS.initialNonMapJsGzipBytes}`);
  for (const asset of assets) {
    const approved = baseline[asset.name];
    if (approved === undefined) { failures.push(`${asset.name} is missing a baseline entry`); continue; }
    if (asset.gzipBytes > approved * (1 + V2_BUDGETS.routeChunkRegressionRatio)) failures.push(`${asset.name} exceeds baseline ${approved} by more than ${V2_BUDGETS.routeChunkRegressionRatio * 100}%`);
  }
  return failures;
}

async function bundleCheck(): Promise<{ readonly assets: readonly BundleAsset[]; readonly failures: readonly string[] }> {
  const npmCli = process.env.npm_execpath;
  const build = npmCli
    ? spawnSync(process.execPath, [npmCli, 'run', 'build', '--workspace', '@bliver/web'], { encoding: 'utf8', stdio: 'pipe' })
    : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build', '--workspace', '@bliver/web'], { encoding: 'utf8', stdio: 'pipe', shell: process.platform === 'win32' });
  if (build.status !== 0) throw new Error(`V2 web build failed: ${build.error?.message ?? build.stderr ?? build.stdout ?? 'unknown build error'}`);
  const assetDirectory = resolve('apps/web/dist/assets');
  const files = (await readdir(assetDirectory)).filter((name) => name.endsWith('.js'));
  const assets = await Promise.all(files.map(async (file) => ({
    name: canonicalAssetName(file),
    gzipBytes: gzipSync(await readFile(resolve(assetDirectory, file))).byteLength,
  })));
  const baseline = JSON.parse(await readFile(resolve('scripts/perf/chunk-baseline.json'), 'utf8')) as Record<string, number>;
  return { assets, failures: evaluateBundle(assets, baseline) };
}

async function optionalWebVitals(): Promise<readonly string[]> {
  const reportPath = process.env.V2_LIGHTHOUSE_REPORT;
  if (!reportPath) { console.log('[perf] SKIP Lighthouse web-vitals: V2_LIGHTHOUSE_REPORT is not set'); return []; }
  const report = JSON.parse(await readFile(resolve(reportPath), 'utf8')) as { audits?: Record<string, { numericValue?: number }> };
  const values = {
    lcp: report.audits?.['largest-contentful-paint']?.numericValue,
    inp: report.audits?.['interaction-to-next-paint']?.numericValue,
    cls: report.audits?.['cumulative-layout-shift']?.numericValue,
  };
  const failures: string[] = [];
  if (values.lcp === undefined || values.lcp > V2_BUDGETS.lcpMs) failures.push(`LCP ${String(values.lcp)} exceeds ${V2_BUDGETS.lcpMs}ms or is missing`);
  if (values.inp === undefined || values.inp > V2_BUDGETS.inpMs) failures.push(`INP ${String(values.inp)} exceeds ${V2_BUDGETS.inpMs}ms or is missing`);
  if (values.cls === undefined || values.cls > V2_BUDGETS.cls) failures.push(`CLS ${String(values.cls)} exceeds ${V2_BUDGETS.cls} or is missing`);
  return failures;
}

export async function runPerformanceGates(): Promise<void> {
  const failures: string[] = [];
  const bundle = await bundleCheck();
  failures.push(...bundle.failures);
  console.log(`[perf] bundle ${bundle.assets.map((asset) => `${asset.name}=${asset.gzipBytes}B gzip`).join(', ')}`);
  const api = await runApiSmoke();
  failures.push(...api.failures);
  for (const metric of api.metrics) console.log(`[perf] api ${metric.name} p50=${metric.p50Ms.toFixed(1)}ms p95=${metric.p95Ms.toFixed(1)}ms errors=${metric.errorRate}`);
  const map = await runMapQueryCheck();
  failures.push(...map.failures);
  console.log(map.liveExplain ? '[perf] PostGIS live EXPLAIN checked' : '[perf] SKIP live PostGIS EXPLAIN: DATABASE_URL/V2_DATABASE_URL is not set; static GIST/query checks passed');
  const outbox = await runOutboxCheck();
  failures.push(...outbox.failures);
  console.log(`[perf] outbox lag=${outbox.metric.lagMs}ms attempts=${outbox.metric.attempts} reconnect=${outbox.metric.reconnectResyncMs.toFixed(1)}ms`);
  failures.push(...await optionalWebVitals());
  if (failures.length) throw new Error(`V2 performance budgets failed:\n- ${failures.join('\n- ')}`);
  console.log('[perf] PASS V2 performance budgets');
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  runPerformanceGates().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
