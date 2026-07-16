import { resolve } from 'node:path';

import { collectLegacyInventory, findV2LegacyViolations } from './legacy-boundary.js';

const root = resolve(import.meta.dirname, '../..');
if (process.argv.includes('--inventory')) {
  console.log(JSON.stringify(await collectLegacyInventory(root), null, 2));
} else {
  const violations = await findV2LegacyViolations(root);
  if (violations.length > 0) {
    for (const violation of violations) console.error(violation);
    process.exitCode = 1;
  } else {
    console.log('V2/V1 boundary: no runtime imports or dependencies');
  }
}
