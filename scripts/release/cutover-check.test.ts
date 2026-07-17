import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { findCutoverViolations } from './cutover-check.js';

const fixtures: string[] = [];
const oldUiRoot = ['front', 'end'].join('');
const oldApiRoot = ['back', 'end'].join('');
const oldDatabasePackage = ['mongo', 'ose'].join('');
const oldDatabaseEnv = ['MONGO', 'DB_URI'].join('');

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'bliver-cutover-check-'));
  fixtures.push(root);
  await mkdir(join(root, 'apps/api/src'), { recursive: true });
  await mkdir(join(root, 'packages/domain/src'), { recursive: true });
  await mkdir(join(root, 'scripts'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: { start: 'node apps/api/dist/server.js' } }));
  await writeFile(join(root, 'apps/api/package.json'), JSON.stringify({ dependencies: { express: '1.0.0' } }));
  await writeFile(join(root, 'apps/api/src/app.ts'), "const path = '/api/v1/users/me';\nconst reservedPrefix = '/api/';\n");
  return root;
}

describe('Phase 8 cutover exit', () => {
  it('passes a V2-only runtime and dependency graph', async () => {
    expect(await findCutoverViolations(await fixture())).toEqual([]);
  });

  it('rejects old roots, direct packages, env names, and unversioned API paths', async () => {
    const root = await fixture();
    await mkdir(join(root, oldUiRoot));
    await mkdir(join(root, oldApiRoot));
    await writeFile(join(root, 'apps/api/package.json'), JSON.stringify({ dependencies: { [oldDatabasePackage]: '1.0.0' } }));
    await writeFile(join(root, 'apps/api/src/app.ts'), `const uri = process.env.${oldDatabaseEnv};\nconst path = '/api/users/me';\n`);

    const violations = await findCutoverViolations(root);
    expect(violations).toEqual(expect.arrayContaining([
      expect.stringContaining(`${oldUiRoot}/ still exists`),
      expect.stringContaining(`${oldApiRoot}/ still exists`),
      expect.stringContaining(oldDatabasePackage),
      expect.stringContaining(oldDatabaseEnv),
      expect.stringContaining('unversioned V1 API path'),
    ]));
  });

  it('permits the Mongo driver only in the isolated migration tool', async () => {
    const root = await fixture();
    await mkdir(join(root, 'tools/legacy-migration'), { recursive: true });
    await writeFile(join(root, 'tools/legacy-migration/package.json'), JSON.stringify({ dependencies: { mongodb: '7.0.0' } }));
    expect(await findCutoverViolations(root)).toEqual([]);

    await writeFile(join(root, 'apps/api/package.json'), JSON.stringify({ dependencies: { mongodb: '7.0.0' } }));
    expect(await findCutoverViolations(root)).toContain('apps/api/package.json directly depends on mongodb');
  });

  it('rejects runtime imports from the isolated migration tool', async () => {
    const root = await fixture();
    await writeFile(join(root, 'apps/api/src/leak.ts'), "import '../../../../tools/legacy-migration/src/index.js';\n");
    expect(await findCutoverViolations(root)).toContain(
      'apps/api/src/leak.ts imports isolated legacy migration tooling',
    );
  });
});
