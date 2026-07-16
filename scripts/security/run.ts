import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { runConfigAudit } from './config-audit.js';
import { runDependencyPolicy } from './dependency-policy.js';

export const SECURITY_BEHAVIOR_TEST_FILES = [
  'apps/api/src/http/__tests__/security-policies.test.ts',
  'apps/api/src/modules/identity/transport/__tests__/routes.test.ts',
  'apps/api/src/modules/media/transport/__tests__/routes.test.ts',
  'apps/api/src/platform/geography/__tests__/providers.test.ts',
  'apps/api/src/modules/moderation/application/__tests__/governance.test.ts',
  'apps/api/src/modules/footprints/application/__tests__/map-query.test.ts',
  'apps/api/src/bootstrap/__tests__/realtime.test.ts',
] as const;

export function runSecurityBehaviorTests(): readonly string[] {
  const result = spawnSync(process.execPath, [
    resolve('node_modules/vitest/vitest.mjs'),
    'run',
    ...SECURITY_BEHAVIOR_TEST_FILES,
    '--reporter=dot',
  ], { encoding: 'utf8', stdio: 'pipe', timeout: 120_000, env: { ...process.env, FORCE_COLOR: '0' } });
  return result.status === 0 ? [] : ['runtime security behavior tests failed'];
}

export async function runSecurityGates(): Promise<void> {
  const configFailures = await runConfigAudit();
  console.log(`[security] config ${configFailures.length ? 'FAIL' : 'PASS'}`);
  const behaviorFailures = runSecurityBehaviorTests();
  console.log(`[security] behavior ${behaviorFailures.length ? 'FAIL' : 'PASS'} (${SECURITY_BEHAVIOR_TEST_FILES.length} suites)`);
  const dependencyFailures = await runDependencyPolicy();
  console.log(`[security] dependencies ${dependencyFailures.length ? 'FAIL' : 'PASS'}`);
  if (configFailures.length || behaviorFailures.length || dependencyFailures.length) throw new Error('[security] FAIL V2 production policies');
  console.log('[security] PASS V2 production policies');
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  runSecurityGates().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : '[security] FAIL');
    process.exitCode = 1;
  });
}
