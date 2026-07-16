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
interface LighthouseReport { readonly audits?: Readonly<Record<string, { readonly numericValue?: number }>>; }

export interface BrowserMetricEvaluation {
  readonly failures: readonly string[];
  readonly skipped: boolean;
  readonly valueMs?: number;
}

export function evaluateBrowserMetric(name: string, values: readonly number[], budgetMs: number, required: boolean): BrowserMetricEvaluation {
  const valid = values.filter((value) => Number.isFinite(value) && value >= 0);
  if (!valid.length) return required
    ? { failures: [`${name} browser evidence is missing`], skipped: false }
    : { failures: [], skipped: true };
  const valueMs = Math.max(...valid);
  return {
    failures: valueMs > budgetMs ? [`${name} ${valueMs.toFixed(1)}ms exceeds ${budgetMs}ms`] : [],
    skipped: false,
    valueMs,
  };
}

export function evaluateLighthouseReport(report: LighthouseReport): readonly string[] {
  const lcp = report.audits?.['largest-contentful-paint']?.numericValue;
  const cls = report.audits?.['cumulative-layout-shift']?.numericValue;
  const failures: string[] = [];
  if (lcp === undefined || lcp > V2_BUDGETS.lcpMs) failures.push(`LCP ${String(lcp)} exceeds ${V2_BUDGETS.lcpMs}ms or is missing`);
  if (cls === undefined || cls > V2_BUDGETS.cls) failures.push(`CLS ${String(cls)} exceeds ${V2_BUDGETS.cls} or is missing`);
  return failures;
}

export function evaluateReleaseEvidence(evidence: { readonly livePostgis: boolean; readonly lighthouseReport: boolean }, releaseMode: boolean): readonly string[] {
  if (!releaseMode) return [];
  const failures: string[] = [];
  if (!evidence.livePostgis) failures.push('Live PostGIS EXPLAIN evidence is missing in release mode');
  if (!evidence.lighthouseReport) failures.push('Lighthouse report is missing in release mode');
  return failures;
}

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

async function browserEvidence(prefix: string, field: string): Promise<{ readonly values: readonly number[]; readonly failures: readonly string[] }> {
  let files: string[];
  try { files = await readdir(resolve('test-results')); }
  catch { return { values: [], failures: [] }; }
  const values: number[] = [];
  const failures: string[] = [];
  for (const file of files.filter((name) => name.startsWith(prefix) && name.endsWith('.json'))) {
    try {
      const evidence = JSON.parse(await readFile(resolve('test-results', file), 'utf8')) as Record<string, unknown>;
      const value = evidence[field];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) failures.push(`${file} has invalid ${field}`);
      else values.push(value);
    } catch { failures.push(`${file} is not valid browser evidence`); }
  }
  return { values, failures };
}

export async function runPerformanceGates(): Promise<void> {
  const failures: string[] = [];
  const releaseMode = process.env.V2_PERF_MODE === 'release' || process.env.CI === 'true';
  console.log(`[perf] mode=${releaseMode ? 'release' : 'local-non-release'}`);
  const bundle = await bundleCheck();
  failures.push(...bundle.failures);
  console.log(`[perf] bundle ${bundle.assets.map((asset) => `${asset.name}=${asset.gzipBytes}B gzip`).join(', ')}`);
  const api = await runApiSmoke();
  failures.push(...api.failures);
  for (const metric of api.metrics) console.log(`[perf] api ${metric.name} p50=${metric.p50Ms.toFixed(1)}ms p95=${metric.p95Ms.toFixed(1)}ms errors=${metric.errorRate}`);
  const map = await runMapQueryCheck();
  failures.push(...map.failures);
  console.log(map.liveExplain ? '[perf] PostGIS live EXPLAIN checked' : `[perf] ${releaseMode ? 'MISSING' : 'SKIP'} live PostGIS EXPLAIN: DATABASE_URL/V2_DATABASE_URL is not set; static checks are not live evidence`);
  const outbox = await runOutboxCheck();
  failures.push(...outbox.failures);
  console.log(`[perf] outbox lag=${outbox.metric.lagMs}ms attempts=${outbox.metric.attempts}`);
  const reconnectEvidence = await browserEvidence('reconnect-resync-', 'resyncMs');
  failures.push(...reconnectEvidence.failures);
  const reconnect = evaluateBrowserMetric('Reconnect resync', reconnectEvidence.values, V2_BUDGETS.commandApiP95Ms, releaseMode);
  failures.push(...reconnect.failures);
  console.log(reconnect.skipped ? '[perf] SKIP reconnect resync: local non-release mode has no Playwright evidence' : `[perf] reconnect resync=${reconnect.valueMs?.toFixed(1)}ms`);
  const inpEvidence = await browserEvidence('browser-vitals-', 'inpMs');
  failures.push(...inpEvidence.failures);
  const inp = evaluateBrowserMetric('INP', inpEvidence.values, V2_BUDGETS.inpMs, releaseMode);
  failures.push(...inp.failures);
  console.log(inp.skipped ? '[perf] SKIP INP: local non-release mode has no browser Event Timing evidence' : `[perf] INP=${inp.valueMs?.toFixed(1)}ms`);
  const reportPath = process.env.V2_LIGHTHOUSE_REPORT;
  failures.push(...evaluateReleaseEvidence({ livePostgis: map.liveExplain, lighthouseReport: Boolean(reportPath) }, releaseMode));
  if (!reportPath) {
    console.log(`[perf] ${releaseMode ? 'MISSING' : 'SKIP'} Lighthouse LCP/CLS: ${releaseMode ? 'release mode requires a report' : 'local non-release mode has no report'}`);
  } else {
    const report = JSON.parse(await readFile(resolve(reportPath), 'utf8')) as LighthouseReport;
    failures.push(...evaluateLighthouseReport(report));
    console.log(`[perf] Lighthouse report=${reportPath}`);
  }
  if (failures.length) throw new Error(`V2 performance budgets failed:\n- ${failures.join('\n- ')}`);
  console.log(releaseMode ? '[perf] PASS V2 release performance budgets' : '[perf] PASS V2 local non-release performance checks');
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  runPerformanceGates().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
