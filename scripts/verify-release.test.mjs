import test from 'node:test';
import assert from 'node:assert/strict';
import { runVerifier } from './verify-release.mjs';

test('release verifier is ordered and stops at the first failing command', () => {
  const calls = [];
  const lines = [];
  const result = runVerifier({
    rootDir: process.cwd(),
    platform: 'win32',
    npmExecPath: 'C:\\tools\\npm-cli.js',
    nodePath: 'C:\\tools\\node.exe',
    spawnSyncImpl(command, args) {
      calls.push([command, ...args]);
      return { status: calls.length === 3 ? 1 : 0, stdout: '', stderr: '' };
    },
    logger: (line) => lines.push(line),
  });

  assert.equal(result.ok, false);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].slice(0, 3), [
    'C:\\tools\\node.exe',
    'C:\\tools\\npm-cli.js',
    'run',
  ]);
  assert.match(lines.at(-1), /exit=1/);
});
