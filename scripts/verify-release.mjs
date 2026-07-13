#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/i;

function commandSteps({ npmCommand, npmPrefixArgs, rootDir }) {
  const backendDir = path.join(rootDir, 'backend');
  const frontendDir = path.join(rootDir, 'frontend');
  const npmArgs = (args) => [...npmPrefixArgs, ...args];
  const steps = [
    { name: 'check-node', command: npmCommand, args: npmArgs(['run', 'check:node']), cwd: rootDir },
    {
      name: 'release-tools',
      command: npmCommand,
      args: npmArgs(['run', 'test:release-tools']),
      cwd: rootDir,
    },
    {
      name: 'backend-jest',
      command: npmCommand,
      args: npmArgs(['test', '--prefix', 'backend', '--', '--runInBand']),
      cwd: rootDir,
    },
  ];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    steps.push({
      name: `backfill-discovery-${attempt}`,
      command: npmCommand,
      args: npmArgs([
        'test', '--prefix', 'backend', '--', '--runInBand',
        'backfill-discovery-window.test.js',
      ]),
      cwd: rootDir,
    });
  }
  steps.push(
    { name: 'frontend-vitest', command: npmCommand, args: npmArgs(['test']), cwd: frontendDir },
    { name: 'frontend-lint', command: npmCommand, args: npmArgs(['run', 'lint']), cwd: frontendDir },
    { name: 'frontend-typecheck', command: npmCommand, args: npmArgs(['run', 'typecheck']), cwd: frontendDir },
    { name: 'frontend-build', command: npmCommand, args: npmArgs(['run', 'build']), cwd: frontendDir },
    {
      name: 'audit-root',
      command: npmCommand,
      args: npmArgs(['audit', '--omit=dev', '--audit-level=high']),
      cwd: rootDir,
    },
    {
      name: 'audit-backend',
      command: npmCommand,
      args: npmArgs(['audit', '--omit=dev', '--audit-level=high']),
      cwd: backendDir,
    },
    {
      name: 'audit-frontend',
      command: npmCommand,
      args: npmArgs(['audit', '--omit=dev', '--audit-level=high']),
      cwd: frontendDir,
    },
    { name: 'git-diff-check', command: 'git', args: ['diff', '--check'], cwd: rootDir },
    {
      name: 'git-status-clean',
      command: 'git',
      args: ['status', '--porcelain'],
      cwd: rootDir,
      requireEmptyStdout: true,
    },
  );
  return steps;
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function collectFiles(directory) {
  const entries = [];
  for (const name of readdirSync(directory).sort()) {
    const absolute = path.join(directory, name);
    if (statSync(absolute).isDirectory()) entries.push(...collectFiles(absolute));
    else entries.push(absolute);
  }
  return entries;
}

function hashArtifacts(rootDir, logger) {
  const distDir = path.join(rootDir, 'frontend', 'dist');
  const indexPath = path.join(distDir, 'index.html');
  const assetsDir = path.join(distDir, 'assets');
  if (!existsSync(indexPath) || !existsSync(assetsDir)) return false;

  const assetFiles = collectFiles(assetsDir);
  if (assetFiles.length === 0) return false;
  const stableEntries = assetFiles.map((filePath) => ({
    path: path.relative(distDir, filePath).split(path.sep).join('/'),
    sha256: sha256(filePath),
  }));
  const stableListHash = createHash('sha256')
    .update(JSON.stringify(stableEntries))
    .digest('hex');

  logger(`HASH frontend/dist/index.html sha256=${sha256(indexPath)}`);
  logger(`HASH frontend/dist/assets-list sha256=${stableListHash} files=${stableEntries.length}`);
  return true;
}

function verifyReleaseSha({ releaseSha, rootDir, spawnSyncImpl, logger }) {
  if (typeof releaseSha !== 'string' || !RELEASE_SHA_PATTERN.test(releaseSha)) {
    logger('STEP release-sha exit=1');
    return false;
  }

  let result;
  try {
    result = spawnSyncImpl('git', ['rev-parse', 'HEAD'], {
      cwd: rootDir,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
  } catch (_error) {
    logger('STEP release-sha exit=1');
    return false;
  }

  const head = String(result?.stdout || '').trim();
  const matches = result?.status === 0
    && RELEASE_SHA_PATTERN.test(head)
    && head === releaseSha;
  logger(`STEP release-sha exit=${matches ? 0 : 1}`);
  return matches;
}

export function runVerifier({
  rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  platform = process.platform,
  npmExecPath = process.env.npm_execpath || '',
  releaseSha = process.env.RELEASE_SHA || '',
  nodePath = process.execPath,
  spawnSyncImpl = spawnSync,
  hashArtifactsImpl = hashArtifacts,
  logger = console.log,
} = {}) {
  const normalizedRoot = path.resolve(rootDir);
  if (!verifyReleaseSha({
    releaseSha,
    rootDir: normalizedRoot,
    spawnSyncImpl,
    logger,
  })) {
    return { ok: false, failedStep: 'release-sha' };
  }

  if (platform === 'win32' && !npmExecPath) {
    logger('STEP npm-invocation exit=1');
    return { ok: false, failedStep: 'npm-invocation' };
  }
  const npmCommand = npmExecPath ? nodePath : 'npm';
  const npmPrefixArgs = npmExecPath ? [npmExecPath] : [];

  for (const step of commandSteps({ npmCommand, npmPrefixArgs, rootDir: normalizedRoot })) {
    let result;
    try {
      result = spawnSyncImpl(step.command, step.args, {
        cwd: step.cwd,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch (_error) {
      result = { status: 1, stdout: '' };
    }
    let exitCode = Number.isInteger(result?.status) ? result.status : 1;
    if (exitCode === 0 && step.requireEmptyStdout && String(result.stdout || '').trim()) {
      exitCode = 1;
    }
    logger(`STEP ${step.name} exit=${exitCode}`);
    if (exitCode !== 0) return { ok: false, failedStep: step.name };
  }

  const artifactsOk = hashArtifactsImpl(normalizedRoot, logger);
  logger(`STEP artifact-hash exit=${artifactsOk ? 0 : 1}`);
  return artifactsOk
    ? { ok: true }
    : { ok: false, failedStep: 'artifact-hash' };
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const result = runVerifier({ rootDir: process.cwd() });
  process.exitCode = result.ok ? 0 : 1;
}
