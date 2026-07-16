import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { buildReleaseManifest, compareFreezeSnapshots, npmInvocation, type FreezeSnapshot } from './manifest.js';

interface VitestReport {
  readonly numPassedTestSuites: number;
  readonly numPassedTests: number;
  readonly numPendingTests: number;
}

const root = resolve(import.meta.dirname, '../..');
const outputRoot = resolve(root, 'artifacts/release');
const npmRuntime = {
  platform: process.platform,
  nodeExecutable: process.execPath,
  ...(process.env.npm_execpath ? { npmExecPath: process.env.npm_execpath } : {}),
};

function runNpm(args: readonly string[], stdio: 'inherit' | 'pipe' = 'inherit') {
  const invocation = npmInvocation(npmRuntime, args);
  const result = spawnSync(invocation.command, [...invocation.args], {
    cwd: root,
    encoding: 'utf8',
    stdio,
    shell: invocation.shell,
  });
  if (result.status !== 0) throw new Error(`npm ${args.join(' ')} exited ${result.status ?? 1}`);
  return result;
}

async function capturePass(pass: 1 | 2): Promise<FreezeSnapshot> {
  const reportPath = resolve(outputRoot, `phase-7-pass-${pass}-vitest.json`);
  runNpm(['run', 'phase7:gates']);
  runNpm(['run', 'test:v2', '--', '--reporter=json', `--outputFile=${reportPath}`]);
  runNpm(['run', 'contracts:openapi', '--workspace', '@bliver/contracts']);
  const report = JSON.parse(await readFile(reportPath, 'utf8')) as VitestReport;
  await rm(reportPath, { force: true });
  const openApi = await readFile(resolve(root, 'artifacts/openapi/v2.json'));
  const document = JSON.parse(openApi.toString('utf8')) as { paths?: Record<string, unknown> };
  return {
    pass,
    gateExitCode: 0,
    testSuitesPassed: report.numPassedTestSuites,
    testsPassed: report.numPassedTests,
    testsSkipped: report.numPendingTests,
    openApiSha256: createHash('sha256').update(openApi).digest('hex'),
    openApiPathCount: Object.keys(document.paths ?? {}).length,
  };
}

await mkdir(outputRoot, { recursive: true });
const releaseSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const npmVersion = String(runNpm(['--version'], 'pipe').stdout).trim();
const first = await capturePass(1);
const second = await capturePass(2);
const comparison = compareFreezeSnapshots(first, second);
const manifest = await buildReleaseManifest({ root, releaseSha, nodeVersion: process.version, npmVersion });

await writeFile(resolve(outputRoot, 'v2-candidate-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(resolve(outputRoot, 'phase-7-freeze.json'), `${JSON.stringify({
  releaseSha,
  featureFreeze: true,
  acceptanceException: 'Phase 7 tag was not created; Phase 8 freeze starts from the explicitly accepted SHA.',
  snapshots: [first, second],
  comparison,
}, null, 2)}\n`);
