import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

describe('V2 workspace manifest', () => {
  it('declares only the V2 apps and shared packages', async () => {
    const pkg = JSON.parse(
      await readFile(resolve(root, 'package.json'), 'utf8'),
    ) as {
      workspaces?: string[];
      engines?: { node?: string };
    };

    expect(pkg.workspaces).toEqual(['apps/*', 'packages/*']);
    expect(pkg.engines?.node).toBe('>=24 <25');
  });

  it('runs the complete V2 suite from the repository root', async () => {
    const pkg = JSON.parse(
      await readFile(resolve(root, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };

    expect(pkg.scripts?.['test:v2']).toBe(
      'vitest run --config vitest.config.ts',
    );
  });
});
