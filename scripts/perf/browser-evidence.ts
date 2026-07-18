export const BROWSER_EVIDENCE_PROJECTS = [
  'mobile-360x800',
  'mobile-390x844',
  'mobile-430x932',
  'tablet-1024x768',
  'desktop-1440x1000',
  'wide-1920x1080',
] as const;

export const BROWSER_EVIDENCE_METRICS = ['reconnect-resync', 'inp'] as const;
export const BROWSER_EVIDENCE_RUN_KIND = 'isolated-browser-performance' as const;
export const BROWSER_EVIDENCE_MAX_AGE_MS = 15 * 60 * 1_000;

export type BrowserEvidenceProject = typeof BROWSER_EVIDENCE_PROJECTS[number];
export type BrowserEvidenceMetric = typeof BROWSER_EVIDENCE_METRICS[number];

export interface BrowserEvidenceManifest {
  readonly schemaVersion: 1;
  readonly runKind: typeof BROWSER_EVIDENCE_RUN_KIND;
  readonly runId: string;
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface BrowserEvidenceRecord {
  readonly schemaVersion: 1;
  readonly runKind: typeof BROWSER_EVIDENCE_RUN_KIND;
  readonly runId: string;
  readonly metric: BrowserEvidenceMetric;
  readonly project: BrowserEvidenceProject;
  readonly capturedAt: string;
  readonly valueMs: number;
}

export interface BrowserEvidenceEvaluation {
  readonly failures: readonly string[];
  readonly reconnectValues: readonly number[];
  readonly inpValues: readonly number[];
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function evaluateBrowserEvidence(
  manifestValue: unknown,
  recordValues: readonly unknown[],
  options: { readonly nowMs?: number; readonly maxAgeMs?: number } = {},
): BrowserEvidenceEvaluation {
  const failures: string[] = [];
  const values = new Map<string, number>();
  const manifest = objectRecord(manifestValue);
  const nowMs = options.nowMs ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? BROWSER_EVIDENCE_MAX_AGE_MS;

  if (!manifest
    || manifest.schemaVersion !== 1
    || manifest.runKind !== BROWSER_EVIDENCE_RUN_KIND
    || typeof manifest.runId !== 'string'
    || !manifest.runId
    || typeof manifest.startedAt !== 'string'
    || typeof manifest.completedAt !== 'string') {
    return { failures: ['browser evidence manifest has invalid schema'], reconnectValues: [], inpValues: [] };
  }

  const startedAt = Date.parse(manifest.startedAt);
  const completedAt = Date.parse(manifest.completedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || completedAt < startedAt) {
    failures.push('browser evidence manifest has invalid timestamps');
  } else if (nowMs - completedAt > maxAgeMs || completedAt > nowMs + 60_000) {
    failures.push('browser evidence manifest is stale or from the future');
  }

  for (const [index, candidate] of recordValues.entries()) {
    const record = objectRecord(candidate);
    if (!record
      || record.schemaVersion !== 1
      || record.runKind !== BROWSER_EVIDENCE_RUN_KIND
      || typeof record.runId !== 'string'
      || typeof record.metric !== 'string'
      || typeof record.project !== 'string'
      || typeof record.capturedAt !== 'string'
      || typeof record.valueMs !== 'number') {
      failures.push(`browser evidence record ${index + 1} has invalid schema`);
      continue;
    }
    if (record.runId !== manifest.runId) failures.push(`browser evidence record ${index + 1} has a runId mismatch`);
    if (!BROWSER_EVIDENCE_METRICS.includes(record.metric as BrowserEvidenceMetric)) {
      failures.push(`browser evidence record ${index + 1} has an unknown metric`);
      continue;
    }
    if (!BROWSER_EVIDENCE_PROJECTS.includes(record.project as BrowserEvidenceProject)) {
      failures.push(`browser evidence record ${index + 1} has an unknown project`);
      continue;
    }
    const capturedAt = Date.parse(record.capturedAt);
    if (!Number.isFinite(capturedAt)
      || nowMs - capturedAt > maxAgeMs
      || capturedAt < startedAt - 1_000
      || capturedAt > completedAt + 1_000) {
      failures.push(`browser evidence record ${index + 1} is stale or outside its run`);
    }
    if (!Number.isFinite(record.valueMs) || record.valueMs < 0) {
      failures.push(`browser evidence record ${index + 1} has an invalid value`);
      continue;
    }
    const key = `${record.metric}:${record.project}`;
    if (values.has(key)) failures.push(`browser evidence has duplicate ${key}`);
    else values.set(key, record.valueMs);
  }

  for (const metric of BROWSER_EVIDENCE_METRICS) {
    for (const project of BROWSER_EVIDENCE_PROJECTS) {
      const key = `${metric}:${project}`;
      if (!values.has(key)) failures.push(`browser evidence is missing ${key}`);
    }
  }

  return {
    failures,
    reconnectValues: BROWSER_EVIDENCE_PROJECTS.flatMap((project) => {
      const value = values.get(`reconnect-resync:${project}`);
      return value === undefined ? [] : [value];
    }),
    inpValues: BROWSER_EVIDENCE_PROJECTS.flatMap((project) => {
      const value = values.get(`inp:${project}`);
      return value === undefined ? [] : [value];
    }),
  };
}

export async function loadBrowserEvidence(
  directory: string,
  options: { readonly nowMs?: number; readonly maxAgeMs?: number } = {},
): Promise<BrowserEvidenceEvaluation> {
  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
  } catch {
    return { failures: ['browser evidence manifest is missing or invalid'], reconnectValues: [], inpValues: [] };
  }

  const records: unknown[] = [];
  const failures: string[] = [];
  for (const metric of BROWSER_EVIDENCE_METRICS) {
    const metricDirectory = resolve(directory, metric);
    let files: string[];
    try {
      files = (await readdir(metricDirectory)).filter((file) => file.endsWith('.json')).sort();
    } catch {
      failures.push(`browser evidence directory is missing for ${metric}`);
      continue;
    }
    for (const file of files) {
      try {
        records.push(JSON.parse(await readFile(resolve(metricDirectory, file), 'utf8')));
      } catch {
        failures.push(`${metric}/${file} is not valid browser evidence JSON`);
      }
    }
  }

  const evaluated = evaluateBrowserEvidence(manifest, records, options);
  return { ...evaluated, failures: [...failures, ...evaluated.failures] };
}
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
