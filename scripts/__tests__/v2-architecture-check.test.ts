import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runArchitectureCheck } from '../v2-architecture-check.js';

const fixtures: string[] = [];
const repositoryRoot = resolve(import.meta.dirname, '../..');

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((path) => rm(path, { recursive: true })));
});

describe('V2 architecture boundaries', () => {
  it('rejects web imports of API internals', async () => {
    const root = await mkdtemp(join(repositoryRoot, '.tmp-v2-architecture-'));
    fixtures.push(root);
    await mkdir(join(root, 'apps/web/src'), { recursive: true });
    await mkdir(join(root, 'apps/api/src/bootstrap'), { recursive: true });
    await mkdir(join(root, 'packages'), { recursive: true });
    await writeFile(join(root, 'apps/web/src/bad.ts'), "import '../../api/src/bootstrap/config.ts';\n");
    await writeFile(join(root, 'apps/api/src/bootstrap/config.ts'), 'export const config = true;\n');

    const result = runArchitectureCheck(root);

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('web-to-api-internal');
  });
});
