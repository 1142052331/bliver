import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('root package exposes the release-tools test command', () => {
  const packageJson = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['test:release-tools'], 'node --test scripts/*.test.mjs');
});

test('CI requires V2 gates and runs release-tool tests before the V2 release build', () => {
  const workflow = readFileSync(path.join(rootDir, '.github', 'workflows', 'ci.yml'), 'utf8');
  const releaseBlock = workflow.match(/\n  release:[\s\S]*$/)?.[0] || '';

  assert.match(workflow, /cache-dependency-path: package-lock\.json/);
  assert.match(releaseBlock, /needs: \[v2-foundation\]/);
  const toolsIndex = releaseBlock.indexOf('run: npm run test:release-tools');
  const buildIndex = releaseBlock.indexOf('run: npm run render-build');
  assert.ok(toolsIndex >= 0);
  assert.ok(buildIndex > toolsIndex);
});

test('release runbook requires both exact SHA variables for smoke and verification', () => {
  const runbook = readFileSync(
    path.join(rootDir, 'docs', 'release', 'eight-phase-release-runbook.md'),
    'utf8',
  );
  assert.match(runbook, /RELEASE_SHA/);
  assert.match(runbook, /EXPECTED_RELEASE/);
  assert.match(runbook, /40[- ]character|40 hex/i);
  assert.match(runbook, /required|must be set|必填/i);
});
