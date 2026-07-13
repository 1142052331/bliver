import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runVerifier } from './verify-release.mjs';

const RELEASE_SHA = '0123456789abcdef0123456789abcdef01234567';
const OTHER_SHA = 'fedcba9876543210fedcba9876543210fedcba98';

test('release verifier is ordered and stops at the first failing command', () => {
  const calls = [];
  const lines = [];
  const result = runVerifier({
    rootDir: process.cwd(),
    platform: 'win32',
    npmExecPath: 'C:\\tools\\npm-cli.js',
    nodePath: 'C:\\tools\\node.exe',
    releaseSha: RELEASE_SHA,
    spawnSyncImpl(command, args) {
      calls.push([command, ...args]);
      if (command === 'git' && args[0] === 'rev-parse') {
        return { status: 0, stdout: `${RELEASE_SHA}\n`, stderr: '' };
      }
      return { status: calls.length === 4 ? 1 : 0, stdout: '', stderr: '' };
    },
    logger: (line) => lines.push(line),
  });

  assert.equal(result.ok, false);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[0], [
    'git',
    'rev-parse',
    'HEAD',
  ]);
  assert.deepEqual(calls[1].slice(0, 3), [
    'C:\\tools\\node.exe',
    'C:\\tools\\npm-cli.js',
    'run',
  ]);
  assert.match(lines.at(-1), /exit=1/);
});

test('release verifier self-tests release tools before backend and frontend gates', () => {
  const calls = [];
  const rootDir = mkdtempSync(path.join(tmpdir(), 'bliver-release-verifier-'));

  try {
    const result = runVerifier({
      rootDir,
      platform: 'linux',
      releaseSha: RELEASE_SHA,
      spawnSyncImpl(command, args, options) {
        calls.push({ command, args, options });
        if (command === 'git' && args[0] === 'rev-parse') {
          return { status: 0, stdout: `${RELEASE_SHA}\n` };
        }
        return { status: 0, stdout: '' };
      },
      hashArtifactsImpl: () => true,
      logger: () => {},
    });

    assert.equal(result.ok, true);
    const releaseToolsIndex = calls.findIndex((call) => call.args.includes('test:release-tools'));
    const backendIndex = calls.findIndex((call) => call.args.includes('backend'));
    const frontendIndex = calls.findIndex((call) => call.options?.cwd?.endsWith('frontend') && call.args.includes('test'));
    assert.ok(releaseToolsIndex > 0);
    assert.ok(backendIndex > releaseToolsIndex);
    assert.ok(frontendIndex > releaseToolsIndex);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('release verifier rejects missing RELEASE_SHA before spawning commands', () => {
  const calls = [];
  const result = runVerifier({
    rootDir: process.cwd(),
    releaseSha: '',
    spawnSyncImpl(...args) {
      calls.push(args);
      return { status: 0, stdout: '' };
    },
    logger: () => {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.failedStep, 'release-sha');
  assert.equal(calls.length, 0);
});

test('release verifier rejects malformed RELEASE_SHA before spawning commands', () => {
  const calls = [];
  const result = runVerifier({
    rootDir: process.cwd(),
    releaseSha: 'not-a-sha',
    spawnSyncImpl(...args) {
      calls.push(args);
      return { status: 0, stdout: '' };
    },
    logger: () => {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.failedStep, 'release-sha');
  assert.equal(calls.length, 0);
});

test('release verifier rejects a SHA mismatch before expensive steps', () => {
  const calls = [];
  const result = runVerifier({
    rootDir: process.cwd(),
    releaseSha: RELEASE_SHA,
    spawnSyncImpl(command, args) {
      calls.push([command, ...args]);
      return command === 'git' && args[0] === 'rev-parse'
        ? { status: 0, stdout: `${OTHER_SHA}\n` }
        : { status: 0, stdout: '' };
    },
    logger: () => {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.failedStep, 'release-sha');
  assert.deepEqual(calls, [['git', 'rev-parse', 'HEAD']]);
});
