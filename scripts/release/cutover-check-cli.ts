import { resolve } from 'node:path';

import { findCutoverViolations } from './cutover-check.js';

const violations = await findCutoverViolations(resolve(import.meta.dirname, '../..'));
if (violations.length > 0) {
  for (const violation of violations) console.error(violation);
  process.exitCode = 1;
} else {
  console.log('Phase 8 cutover: V2-only runtime and dependency graph');
}
