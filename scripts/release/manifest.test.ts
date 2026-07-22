import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildReleaseManifest,
  compareFreezeSnapshots,
  npmInvocation,
  type FreezeSnapshot,
} from './manifest.js';

const fixtures: string[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

describe('V2 release candidate manifest', () => {
  it('hashes the root lock, ordered migration contents, and ordered public asset list', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bliver-release-manifest-'));
    fixtures.push(root);
    await mkdir(join(root, 'apps/api/drizzle'), { recursive: true });
    await mkdir(join(root, 'apps/web/dist/assets'), { recursive: true });
    await mkdir(join(root, 'apps/web/dist/.vite'), { recursive: true });
    await writeFile(join(root, 'package-lock.json'), 'root-lock\n');
    await writeFile(join(root, 'apps/api/drizzle/0001.sql'), 'select 1;\n');
    await writeFile(join(root, 'apps/api/drizzle/0000.sql'), 'select 0;\n');
    await writeFile(join(root, 'apps/web/dist/index.html'), '<main>V2</main>\n');
    await writeFile(join(root, 'apps/web/dist/assets/app.js'), 'export {};\n');
    await writeFile(join(root, 'apps/web/dist/.vite/manifest.json'), '{}\n');

    const manifest = await buildReleaseManifest({
      root,
      releaseSha: 'a'.repeat(40),
      nodeVersion: 'v24.16.0',
      npmVersion: '11.13.0',
    });

    expect(manifest).toEqual({
      schemaVersion: 1,
      releaseSha: 'a'.repeat(40),
      nodeVersion: 'v24.16.0',
      npmVersion: '11.13.0',
      rootLockSha256: sha256('root-lock\n'),
      migrationSha256: sha256('0000.sql\0select 0;\n\n0001.sql\0select 1;\n\n'),
      migrations: ['0000.sql', '0001.sql'],
      assetListSha256: sha256('assets/app.js\nindex.html\n'),
      assets: ['assets/app.js', 'index.html'],
    });
    expect(manifest.assets).not.toContain('.vite/manifest.json');
  });

  it('rejects anything other than the exact immutable release SHA', async () => {
    await expect(buildReleaseManifest({
      root: '.',
      releaseSha: 'candidate',
      nodeVersion: 'v24.16.0',
      npmVersion: '11.13.0',
    })).rejects.toThrow(/40-character Git SHA/);
  });
});

describe('Phase 7 freeze comparison', () => {
  const snapshot: FreezeSnapshot = {
    pass: 1,
    gateExitCode: 0,
    testSuitesPassed: 100,
    testsPassed: 200,
    testsSkipped: 7,
    openApiSha256: 'b'.repeat(64),
    openApiPathCount: 12,
  };

  it('accepts two successful passes with identical counts and OpenAPI checksum', () => {
    expect(compareFreezeSnapshots(snapshot, { ...snapshot, pass: 2 })).toEqual({
      countsMatch: true,
      openApiMatches: true,
    });
  });

  it('fails closed on gate, count, or OpenAPI drift', () => {
    expect(() => compareFreezeSnapshots(snapshot, {
      ...snapshot,
      pass: 2,
      testsPassed: 201,
    })).toThrow(/Phase 7 freeze mismatch/);
    expect(() => compareFreezeSnapshots(snapshot, {
      ...snapshot,
      pass: 2,
      openApiSha256: 'c'.repeat(64),
    })).toThrow(/Phase 7 freeze mismatch/);
    expect(() => compareFreezeSnapshots(snapshot, {
      ...snapshot,
      pass: 2,
      gateExitCode: 1,
    })).toThrow(/Phase 7 gate failed/);
  });
});

describe('release command portability', () => {
  it('runs the npm JavaScript CLI through Node on Windows', () => {
    expect(npmInvocation({
      platform: 'win32',
      nodeExecutable: 'C:/node/node.exe',
      npmExecPath: 'C:/node/node_modules/npm/bin/npm-cli.js',
    }, ['--version'])).toEqual({
      command: 'C:/node/node.exe',
      args: ['C:/node/node_modules/npm/bin/npm-cli.js', '--version'],
      shell: false,
    });
  });
});
