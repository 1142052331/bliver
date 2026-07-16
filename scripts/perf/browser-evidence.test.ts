import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  BROWSER_EVIDENCE_PROJECTS,
  evaluateBrowserEvidence,
  loadBrowserEvidence,
  type BrowserEvidenceManifest,
  type BrowserEvidenceRecord,
} from './browser-evidence.js';

const nowMs = Date.parse('2026-07-16T06:00:00.000Z');
const runId = 'browser-performance-run-1';
const manifest: BrowserEvidenceManifest = {
  schemaVersion: 1,
  runKind: 'isolated-browser-performance',
  runId,
  startedAt: '2026-07-16T05:58:00.000Z',
  completedAt: '2026-07-16T05:59:00.000Z',
};
const records: BrowserEvidenceRecord[] = BROWSER_EVIDENCE_PROJECTS.flatMap((project) => [
  {
    schemaVersion: 1,
    runKind: 'isolated-browser-performance' as const,
    runId,
    metric: 'reconnect-resync' as const,
    project,
    capturedAt: '2026-07-16T05:58:30.000Z',
    valueMs: 45,
  },
  {
    schemaVersion: 1,
    runKind: 'isolated-browser-performance' as const,
    runId,
    metric: 'inp' as const,
    project,
    capturedAt: '2026-07-16T05:58:40.000Z',
    valueMs: 64,
  },
]);

describe('isolated browser performance evidence', () => {
  it('accepts one fresh record for both metrics from every viewport', () => {
    expect(evaluateBrowserEvidence(manifest, records, { nowMs })).toEqual({
      failures: [],
      reconnectValues: [45, 45, 45, 45],
      inpValues: [64, 64, 64, 64],
    });
  });

  it('rejects missing, duplicate and mixed-run records', () => {
    const missing = evaluateBrowserEvidence(manifest, records.slice(1), { nowMs });
    expect(missing.failures).toContainEqual(expect.stringContaining('missing'));

    const duplicate = evaluateBrowserEvidence(manifest, [...records, records[0]], { nowMs });
    expect(duplicate.failures).toContainEqual(expect.stringContaining('duplicate'));

    const mixed = evaluateBrowserEvidence(manifest, records.map((record, index) => index === 0 ? { ...record, runId: 'another-run' } : record), { nowMs });
    expect(mixed.failures).toContainEqual(expect.stringContaining('runId'));
  });

  it('rejects stale and ordinary full-suite evidence', () => {
    const stale = evaluateBrowserEvidence(
      { ...manifest, startedAt: '2026-07-16T04:00:00.000Z', completedAt: '2026-07-16T04:01:00.000Z' },
      records.map((record) => ({ ...record, capturedAt: '2026-07-16T04:00:30.000Z' })),
      { nowMs },
    );
    expect(stale.failures).toContainEqual(expect.stringContaining('stale'));

    const ordinary = evaluateBrowserEvidence(manifest, [
      ...records,
      { source: 'playwright-dual-browser', project: 'mobile-360x800', resyncMs: 40 },
    ], { nowMs });
    expect(ordinary.failures).toContainEqual(expect.stringContaining('schema'));
  });

  it('loads only a complete dedicated evidence directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bliver-browser-evidence-'));
    try {
      await expect(loadBrowserEvidence(join(root, 'missing'), { nowMs })).resolves.toMatchObject({
        failures: [expect.stringContaining('missing')],
      });

      await Promise.all([
        mkdir(join(root, 'reconnect-resync'), { recursive: true }),
        mkdir(join(root, 'inp'), { recursive: true }),
        writeFile(join(root, 'manifest.json'), JSON.stringify(manifest), 'utf8'),
      ]);
      await Promise.all(records.map((record) => writeFile(
        join(root, record.metric, `${record.metric}-${record.project}.json`),
        JSON.stringify(record),
        'utf8',
      )));
      await expect(loadBrowserEvidence(root, { nowMs })).resolves.toMatchObject({ failures: [] });

      await writeFile(join(root, 'reconnect-resync', 'legacy-full-suite.json'), JSON.stringify({ source: 'playwright-dual-browser', resyncMs: 40 }), 'utf8');
      await expect(loadBrowserEvidence(root, { nowMs })).resolves.toMatchObject({
        failures: [expect.stringContaining('schema')],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
