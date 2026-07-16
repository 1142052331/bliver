import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { writeBrowserEvidenceRecord } from './browser-evidence-writer.js';

describe('browser performance evidence writer', () => {
  it('does not emit evidence during the ordinary full Playwright suite', async () => {
    await expect(writeBrowserEvidenceRecord({ metric: 'inp', project: 'mobile-360x800', valueMs: 42 }, {})).resolves.toBe(false);
  });

  it('writes the isolated run schema and rejects a mismatched metric stage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bliver-browser-writer-'));
    const environment = {
      V2_BROWSER_EVIDENCE_DIR: root,
      V2_BROWSER_EVIDENCE_RUN_ID: 'run-writer-1',
      V2_BROWSER_EVIDENCE_METRIC: 'inp',
    };
    try {
      await expect(writeBrowserEvidenceRecord(
        { metric: 'inp', project: 'mobile-360x800', valueMs: 42 },
        environment,
        () => new Date('2026-07-16T06:00:00.000Z'),
      )).resolves.toBe(true);
      await expect(readFile(join(root, 'inp', 'inp-mobile-360x800.json'), 'utf8')).resolves.toBe(JSON.stringify({
        schemaVersion: 1,
        runKind: 'isolated-browser-performance',
        runId: 'run-writer-1',
        metric: 'inp',
        project: 'mobile-360x800',
        capturedAt: '2026-07-16T06:00:00.000Z',
        valueMs: 42,
      }));
      await expect(writeBrowserEvidenceRecord({ metric: 'reconnect-resync', project: 'mobile-360x800', valueMs: 40 }, environment)).rejects.toThrow(/metric/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
