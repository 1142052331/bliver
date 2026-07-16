import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { browserEvidencePlaywrightArguments, cleanMetricEvidence } from './collect-browser-evidence.js';

describe('browser evidence collector', () => {
  it('cleans only JSON records for the selected metric', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bliver-browser-collector-'));
    const reconnect = join(root, 'reconnect-resync');
    const inp = join(root, 'inp');
    try {
      await Promise.all([mkdir(reconnect), mkdir(inp)]);
      await Promise.all([
        writeFile(join(reconnect, 'old.json'), '{}'),
        writeFile(join(reconnect, 'trace.txt'), 'keep'),
        writeFile(join(inp, 'current.json'), '{"keep":true}'),
      ]);

      await cleanMetricEvidence(root, 'reconnect-resync');

      await expect(readFile(join(reconnect, 'old.json'), 'utf8')).rejects.toThrow();
      await expect(readFile(join(reconnect, 'trace.txt'), 'utf8')).resolves.toBe('keep');
      await expect(readFile(join(inp, 'current.json'), 'utf8')).resolves.toContain('keep');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('pins low-concurrency no-retry runs to separate output directories', () => {
    const reconnect = browserEvidencePlaywrightArguments('reconnect-resync', '.artifacts/playwright/reconnect');
    const inp = browserEvidencePlaywrightArguments('inp', '.artifacts/playwright/inp');
    for (const args of [reconnect, inp]) {
      expect(args).toContain('--workers=1');
      expect(args).toContain('--retries=0');
    }
    expect(reconnect).toContain('--output=.artifacts/playwright/reconnect');
    expect(inp).toContain('--output=.artifacts/playwright/inp');
    expect(reconnect).not.toEqual(inp);
  });
});
