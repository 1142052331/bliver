import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  BROWSER_EVIDENCE_RUN_KIND,
  type BrowserEvidenceMetric,
  type BrowserEvidenceProject,
  type BrowserEvidenceRecord,
} from './browser-evidence.js';

export async function writeBrowserEvidenceRecord(
  input: { readonly metric: BrowserEvidenceMetric; readonly project: BrowserEvidenceProject; readonly valueMs: number },
  environment: Readonly<Record<string, string | undefined>> = process.env,
  now: () => Date = () => new Date(),
): Promise<boolean> {
  const directory = environment.V2_BROWSER_EVIDENCE_DIR;
  if (!directory) return false;
  const runId = environment.V2_BROWSER_EVIDENCE_RUN_ID;
  const stageMetric = environment.V2_BROWSER_EVIDENCE_METRIC;
  if (!runId) throw new Error('Browser evidence run ID is missing');
  if (stageMetric !== input.metric) throw new Error(`Browser evidence metric mismatch: expected ${input.metric}, received ${String(stageMetric)}`);
  if (!Number.isFinite(input.valueMs) || input.valueMs < 0) throw new Error(`Browser evidence ${input.metric} value is invalid`);

  const record: BrowserEvidenceRecord = {
    schemaVersion: 1,
    runKind: BROWSER_EVIDENCE_RUN_KIND,
    runId,
    metric: input.metric,
    project: input.project,
    capturedAt: now().toISOString(),
    valueMs: input.valueMs,
  };
  const metricDirectory = resolve(directory, input.metric);
  await mkdir(metricDirectory, { recursive: true });
  await writeFile(resolve(metricDirectory, `${input.metric}-${input.project}.json`), JSON.stringify(record), 'utf8');
  return true;
}
