import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

import { runApiSmoke } from './api-smoke.js';
import { V2_BUDGETS } from './budgets.js';
import {
  bundleGzipBytes,
  classifyViteBundle,
  evaluateBundle,
  manifestJavaScriptAssets,
  type BundleAsset,
  type ViteManifest,
} from './bundle.js';
import { loadBrowserEvidence, type BrowserEvidenceEvaluation } from './browser-evidence.js';
import { runMapQueryCheck } from './map-query.js';
import { runOutboxCheck } from './outbox-lag.js';

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

export function evaluatePerformanceBrowserEvidence(evidence: BrowserEvidenceEvaluation): {
  readonly failures: readonly string[];
  readonly reconnect: BrowserMetricEvaluation;
  readonly inp: BrowserMetricEvaluation;
} {
  const reconnect = evaluateBrowserMetric('Reconnect resync', evidence.reconnectValues, V2_BUDGETS.commandApiP95Ms, true);
  const inp = evaluateBrowserMetric('INP', evidence.inpValues, V2_BUDGETS.inpMs, true);
  return { failures: [...evidence.failures, ...reconnect.failures, ...inp.failures], reconnect, inp };
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

async function bundleCheck(): Promise<{
  readonly assets: readonly BundleAsset[];
  readonly failures: readonly string[];
  readonly initialShellBytes: number;
  readonly spatialRuntimeBytes: number;
}> {
  const npmCli = process.env.npm_execpath;
  const build = npmCli
    ? spawnSync(process.execPath, [npmCli, 'run', 'build', '--workspace', '@bliver/web', '--', '--manifest'], { encoding: 'utf8', stdio: 'pipe' })
    : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build', '--workspace', '@bliver/web', '--', '--manifest'], { encoding: 'utf8', stdio: 'pipe', shell: process.platform === 'win32' });
  if (build.status !== 0) throw new Error(`V2 web build failed: ${build.error?.message ?? build.stderr ?? build.stdout ?? 'unknown build error'}`);
  const distributionDirectory = resolve('apps/web/dist');
  const manifest = JSON.parse(await readFile(resolve(distributionDirectory, '.vite/manifest.json'), 'utf8')) as ViteManifest;
  const indexHtml = await readFile(resolve(distributionDirectory, 'index.html'), 'utf8');
  const descriptors = manifestJavaScriptAssets(manifest);
  const outputJavaScript = new Set((await readdir(resolve(distributionDirectory, 'assets')))
    .filter((name) => name.endsWith('.js'))
    .map((name) => `assets/${name}`));
  const manifestJavaScript = new Set(descriptors.map((asset) => asset.file));
  const inventoryFailures = [
    ...[...outputJavaScript].filter((file) => !manifestJavaScript.has(file)).map((file) => `${file} is missing from the Vite manifest`),
    ...[...manifestJavaScript].filter((file) => !outputJavaScript.has(file)).map((file) => `${file} is missing from the build output`),
  ];
  const assets = await Promise.all(descriptors.map(async ({ logicalName, file }) => ({
    logicalName,
    file,
    gzipBytes: gzipSync(await readFile(resolve(distributionDirectory, file))).byteLength,
  })));
  const classification = classifyViteBundle(manifest, indexHtml);
  const baseline = JSON.parse(await readFile(resolve('scripts/perf/chunk-baseline.json'), 'utf8')) as Record<string, number>;
  return {
    assets,
    failures: [...inventoryFailures, ...evaluateBundle(assets, baseline, classification)],
    initialShellBytes: bundleGzipBytes(assets, classification.initialShellJsFiles),
    spatialRuntimeBytes: bundleGzipBytes(assets, classification.spatialIncrementJsFiles),
  };
}

export async function runPerformanceGates(): Promise<void> {
  const failures: string[] = [];
  const releaseMode = process.env.V2_PERF_MODE === 'release' || process.env.CI === 'true';
  console.log(`[perf] mode=${releaseMode ? 'release' : 'local-non-release'}`);
  const bundle = await bundleCheck();
  failures.push(...bundle.failures);
  console.log(`[perf] bundle ${bundle.assets.map((asset) => `${asset.logicalName} [${asset.file}]=${asset.gzipBytes}B gzip`).join(', ')}`);
  console.log(`[perf] initial shell JS=${bundle.initialShellBytes}B gzip; spatial runtime increment=${bundle.spatialRuntimeBytes}B gzip`);
  const api = await runApiSmoke();
  failures.push(...api.failures);
  for (const metric of api.metrics) console.log(`[perf] api ${metric.name} p50=${metric.p50Ms.toFixed(1)}ms p95=${metric.p95Ms.toFixed(1)}ms errors=${metric.errorRate}`);
  const map = await runMapQueryCheck();
  failures.push(...map.failures);
  console.log(map.liveExplain ? '[perf] PostGIS live EXPLAIN checked' : `[perf] ${releaseMode ? 'MISSING' : 'SKIP'} live PostGIS EXPLAIN: DATABASE_URL/V2_DATABASE_URL is not set; static checks are not live evidence`);
  const outbox = await runOutboxCheck();
  failures.push(...outbox.failures);
  console.log(`[perf] outbox lag=${outbox.metric.lagMs}ms attempts=${outbox.metric.attempts}`);
  const browserEvidenceDirectory = resolve(process.env.V2_BROWSER_EVIDENCE_DIR ?? '.artifacts/browser-performance/evidence');
  const browser = evaluatePerformanceBrowserEvidence(await loadBrowserEvidence(browserEvidenceDirectory));
  failures.push(...browser.failures);
  console.log(`[perf] browser evidence=${browserEvidenceDirectory}`);
  console.log(`[perf] reconnect resync=${browser.reconnect.valueMs?.toFixed(1) ?? 'missing'}ms`);
  console.log(`[perf] INP=${browser.inp.valueMs?.toFixed(1) ?? 'missing'}ms`);
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
