import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { collectLegacyInventory, findV2LegacyViolations } from './legacy-boundary.js';

const fixtures: string[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'bliver-legacy-boundary-'));
  fixtures.push(root);
  await mkdir(join(root, 'apps/web/src'), { recursive: true });
  await mkdir(join(root, 'apps/api/src'), { recursive: true });
  await mkdir(join(root, 'packages/domain/src'), { recursive: true });
  await mkdir(join(root, 'frontend/public'), { recursive: true });
  await mkdir(join(root, 'backend/routes'), { recursive: true });
  await mkdir(join(root, 'backend/socket'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ workspaces: ['apps/*', 'packages/*'] }));
  await writeFile(join(root, 'apps/web/package.json'), JSON.stringify({ dependencies: { react: '1.0.0' } }));
  await writeFile(join(root, 'apps/api/package.json'), JSON.stringify({ dependencies: { express: '1.0.0' } }));
  await writeFile(join(root, 'frontend/package.json'), JSON.stringify({ dependencies: { axios: '1.0.0' } }));
  await writeFile(join(root, 'backend/package.json'), JSON.stringify({ dependencies: { mongoose: '1.0.0', jsonwebtoken: '1.0.0' } }));
  await writeFile(join(root, 'frontend/public/marker.png'), 'asset');
  await writeFile(join(root, 'backend/routes/api.js'), "router.get('/footprints', handler);\n");
  await writeFile(join(root, 'backend/socket/index.js'), "socket.on('join', handler); io.emit('footprint:new', value);\n");
  await writeFile(join(root, 'backend/index.js'), "const uri = process.env.MONGODB_URI;\n");
  return root;
}

describe('V1 deletion inventory', () => {
  it('captures legacy packages, env, routes, Socket events, and assets', async () => {
    const root = await fixture();
    const inventory = await collectLegacyInventory(root);

    expect(inventory.packages).toEqual(expect.arrayContaining(['axios', 'jsonwebtoken', 'mongoose']));
    expect(inventory.environmentNames).toContain('MONGODB_URI');
    expect(inventory.routes).toContain('GET /api/footprints');
    expect(inventory.socketEvents).toEqual(['footprint:new', 'join']);
    expect(inventory.assets).toEqual(['frontend/public/marker.png']);
  });
});

describe('V2/V1 runtime boundary', () => {
  it('accepts workspace code with no V1 imports or Mongo/JWT packages', async () => {
    const root = await fixture();
    await writeFile(join(root, 'apps/web/src/app.ts'), "import React from 'react';\n");
    expect(await findV2LegacyViolations(root)).toEqual([]);
  });

  it('rejects V1 imports, legacy bridge symbols, and Mongo/JWT packages in V2', async () => {
    const root = await fixture();
    await writeFile(join(root, 'apps/web/src/app.ts'), "import bridge from '../../../frontend/src/App.jsx';\nconst name = 'LegacyDestinationBridge';\n");
    await writeFile(join(root, 'apps/api/package.json'), JSON.stringify({ dependencies: { mongoose: '1.0.0' } }));

    expect(await findV2LegacyViolations(root)).toEqual(expect.arrayContaining([
      expect.stringMatching(/apps\/web\/src\/app\.ts.*V1 path import/),
      expect.stringMatching(/apps\/web\/src\/app\.ts.*LegacyDestinationBridge/),
      expect.stringMatching(/apps\/api\/package\.json.*mongoose/),
    ]));
  });
});
