import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { verifyCandidate } from './candidate.js';

const fixtures: string[] = [];
const sha = 'a'.repeat(40);

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function builtRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'bliver-candidate-'));
  fixtures.push(root);
  await mkdir(join(root, 'apps/web/dist'), { recursive: true });
  await mkdir(join(root, 'apps/api/dist/bootstrap'), { recursive: true });
  await writeFile(join(root, 'apps/web/dist/index.html'), '<!doctype html>');
  await writeFile(join(root, 'apps/api/dist/bootstrap/server.js'), 'export {};');
  return root;
}

describe('V2 deployment candidate', () => {
  it('accepts only one exact SHA with both API and web build outputs', async () => {
    const root = await builtRoot();
    await expect(verifyCandidate({ root, releaseSha: sha, gitHead: sha, renderGitCommit: sha })).resolves.toEqual({ releaseSha: sha });
  });

  it('fails before migration on malformed or mismatched release identity', async () => {
    const root = await builtRoot();
    await expect(verifyCandidate({ root, releaseSha: 'candidate', gitHead: sha })).rejects.toThrow(/40-character/);
    await expect(verifyCandidate({ root, releaseSha: sha, gitHead: 'b'.repeat(40) })).rejects.toThrow(/Git HEAD/);
    await expect(verifyCandidate({ root, releaseSha: sha, gitHead: sha, renderGitCommit: 'c'.repeat(40) })).rejects.toThrow(/Render Git commit/);
  });

  it('fails when either build output is absent', async () => {
    const root = await builtRoot();
    await rm(join(root, 'apps/web/dist/index.html'));
    await expect(verifyCandidate({ root, releaseSha: sha, gitHead: sha })).rejects.toThrow(/apps\/web\/dist\/index.html/);
  });
});
