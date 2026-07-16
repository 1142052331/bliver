import { pathToFileURL } from 'node:url';

import { runConfigAudit } from './config-audit.js';
import { runDependencyPolicy } from './dependency-policy.js';

export async function runSecurityGates(): Promise<void> {
  const configFailures = await runConfigAudit();
  console.log(`[security] config ${configFailures.length ? 'FAIL' : 'PASS'}`);
  const dependencyFailures = await runDependencyPolicy();
  console.log(`[security] dependencies ${dependencyFailures.length ? 'FAIL' : 'PASS'}`);
  if (configFailures.length || dependencyFailures.length) throw new Error('[security] FAIL V2 production policies');
  console.log('[security] PASS V2 production policies');
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  runSecurityGates().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : '[security] FAIL');
    process.exitCode = 1;
  });
}
