import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

export interface ReleaseManifest {
  readonly schemaVersion: 1;
  readonly releaseSha: string;
  readonly nodeVersion: string;
  readonly npmVersion: string;
  readonly rootLockSha256: string;
  readonly migrationSha256: string;
  readonly migrations: readonly string[];
  readonly assetListSha256: string;
  readonly assets: readonly string[];
}

export interface FreezeSnapshot {
  readonly pass: 1 | 2;
  readonly gateExitCode: number;
  readonly testSuitesPassed: number;
  readonly testsPassed: number;
  readonly testsSkipped: number;
  readonly openApiSha256: string;
  readonly openApiPathCount: number;
}

export function npmInvocation(
  runtime: Readonly<{
    platform: NodeJS.Platform;
    nodeExecutable: string;
    npmExecPath?: string;
  }>,
  args: readonly string[],
): Readonly<{ command: string; args: readonly string[]; shell: boolean }> {
  if (runtime.npmExecPath) {
    return {
      command: runtime.nodeExecutable,
      args: [runtime.npmExecPath, ...args],
      shell: false,
    };
  }
  return {
    command: runtime.platform === 'win32' ? 'npm.cmd' : 'npm',
    args,
    shell: runtime.platform === 'win32',
  };
}

const hash = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex');

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return entry.isFile() ? [path] : [];
  }));
  return nested.flat().sort((left, right) => left.localeCompare(right));
}

const normalizedRelative = (root: string, path: string): string =>
  relative(root, path).split(sep).join('/');

export async function buildReleaseManifest(input: Readonly<{
  root: string;
  releaseSha: string;
  nodeVersion: string;
  npmVersion: string;
}>): Promise<ReleaseManifest> {
  if (!/^[0-9a-f]{40}$/.test(input.releaseSha)) {
    throw new Error('releaseSha must be an exact 40-character Git SHA');
  }

  const root = resolve(input.root);
  const migrationRoot = resolve(root, 'apps/api/drizzle');
  const assetRoot = resolve(root, 'apps/web/dist');
  const migrationPaths = (await listFiles(migrationRoot))
    .filter((path) => path.endsWith('.sql'));
  const migrations = migrationPaths.map((path) => normalizedRelative(migrationRoot, path));
  const migrationChunks = await Promise.all(migrationPaths.map(async (path, index) =>
    `${migrations[index]}\0${await readFile(path, 'utf8')}\n`));
  const assets = (await listFiles(assetRoot)).map((path) => normalizedRelative(assetRoot, path));

  return {
    schemaVersion: 1,
    releaseSha: input.releaseSha,
    nodeVersion: input.nodeVersion,
    npmVersion: input.npmVersion,
    rootLockSha256: hash(await readFile(resolve(root, 'package-lock.json'))),
    migrationSha256: hash(migrationChunks.join('')),
    migrations,
    assetListSha256: hash(`${assets.join('\n')}\n`),
    assets,
  };
}

export function compareFreezeSnapshots(
  first: FreezeSnapshot,
  second: FreezeSnapshot,
): Readonly<{ countsMatch: true; openApiMatches: true }> {
  if (first.gateExitCode !== 0 || second.gateExitCode !== 0) {
    throw new Error('Phase 7 gate failed during candidate freeze');
  }
  const countsMatch = first.testSuitesPassed === second.testSuitesPassed
    && first.testsPassed === second.testsPassed
    && first.testsSkipped === second.testsSkipped
    && first.openApiPathCount === second.openApiPathCount;
  const openApiMatches = first.openApiSha256 === second.openApiSha256;
  if (!countsMatch || !openApiMatches) {
    throw new Error('Phase 7 freeze mismatch between pass 1 and pass 2');
  }
  return { countsMatch: true, openApiMatches: true };
}
