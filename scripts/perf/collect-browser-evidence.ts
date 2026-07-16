import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  BROWSER_EVIDENCE_RUN_KIND,
  loadBrowserEvidence,
  type BrowserEvidenceManifest,
  type BrowserEvidenceMetric,
} from './browser-evidence.js';

const stages: Readonly<Record<BrowserEvidenceMetric, { readonly spec: string; readonly title: string }>> = {
  'reconnect-resync': {
    spec: 'apps/web/e2e/social-messaging.spec.ts',
    title: 'real dual-browser Socket uses Outbox delivery, reconnect, block, and session revoke',
  },
  inp: {
    spec: 'apps/web/e2e/accessibility.spec.ts',
    title: 'filter dialog supports keyboard focus, Escape and focus restoration',
  },
};

export async function cleanMetricEvidence(directory: string, metric: BrowserEvidenceMetric): Promise<void> {
  const metricDirectory = resolve(directory, metric);
  await mkdir(metricDirectory, { recursive: true });
  const entries = await readdir(metricDirectory, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => rm(resolve(metricDirectory, entry.name), { force: true })));
}

export function browserEvidencePlaywrightArguments(metric: BrowserEvidenceMetric, outputDirectory: string): string[] {
  const stage = stages[metric];
  return [
    'test',
    stage.spec,
    '--grep',
    stage.title,
    '--workers=1',
    '--retries=0',
    `--output=${outputDirectory}`,
  ];
}

function runPlaywrightStage(input: {
  readonly metric: BrowserEvidenceMetric;
  readonly evidenceDirectory: string;
  readonly outputDirectory: string;
  readonly runId: string;
}): void {
  const cli = resolve('node_modules/@playwright/test/cli.js');
  const result = spawnSync(process.execPath, [cli, ...browserEvidencePlaywrightArguments(input.metric, input.outputDirectory)], {
    cwd: resolve('.'),
    env: {
      ...process.env,
      CI: 'true',
      V2_BROWSER_EVIDENCE_DIR: input.evidenceDirectory,
      V2_BROWSER_EVIDENCE_RUN_ID: input.runId,
      V2_BROWSER_EVIDENCE_METRIC: input.metric,
    },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Browser evidence stage ${input.metric} failed with exit code ${String(result.status)}`);
}

export async function collectBrowserEvidence(): Promise<void> {
  const root = resolve(process.env.V2_BROWSER_EVIDENCE_ROOT ?? '.artifacts/browser-performance');
  const evidenceDirectory = resolve(root, 'evidence');
  const outputRoot = resolve(root, 'playwright');
  const manifestPath = resolve(evidenceDirectory, 'manifest.json');
  await mkdir(evidenceDirectory, { recursive: true });
  await rm(manifestPath, { force: true });

  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  try {
    for (const metric of ['reconnect-resync', 'inp'] as const) {
      await cleanMetricEvidence(evidenceDirectory, metric);
      runPlaywrightStage({
        metric,
        evidenceDirectory,
        outputDirectory: resolve(outputRoot, metric),
        runId,
      });
    }
    const manifest: BrowserEvidenceManifest = {
      schemaVersion: 1,
      runKind: BROWSER_EVIDENCE_RUN_KIND,
      runId,
      startedAt,
      completedAt: new Date().toISOString(),
    };
    await writeFile(manifestPath, JSON.stringify(manifest), 'utf8');
    const evaluation = await loadBrowserEvidence(evidenceDirectory);
    if (evaluation.failures.length) throw new Error(`Browser evidence validation failed:\n- ${evaluation.failures.join('\n- ')}`);
    console.log(`[browser-evidence] run=${runId}`);
    console.log(`[browser-evidence] reconnect=${evaluation.reconnectValues.join(',')}ms`);
    console.log(`[browser-evidence] inp=${evaluation.inpValues.join(',')}ms`);
    console.log(`[browser-evidence] PASS directory=${evidenceDirectory}`);
  } catch (error) {
    await rm(manifestPath, { force: true });
    throw error;
  }
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  collectBrowserEvidence().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
