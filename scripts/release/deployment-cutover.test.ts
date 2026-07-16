import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): Promise<string> => readFile(resolve(root, path), 'utf8');

describe('V2 deployment cutover', () => {
  it('uses only root workspace build, predeploy, start, and exact-SHA commands', async () => {
    const pkg = JSON.parse(await read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts.start).toBe('node apps/api/dist/bootstrap/server.js');
    expect(pkg.scripts['render-build']).toContain('release:v2:verify-sha');
    expect(pkg.scripts['render-build']).toContain('build:v2');
    expect(pkg.scripts['render-build']).toContain('release:v2:verify-candidate');
    expect(pkg.scripts['release:v2:predeploy']).toBe('npm run release:v2:verify-candidate && npm run db:v2:migrate');
    for (const rootName of [['front', 'end'].join(''), ['back', 'end'].join('')]) expect(pkg.scripts['render-build']).not.toContain(rootName);
    const api = JSON.parse(await read('apps/api/package.json')) as { scripts: Record<string, string> };
    expect(api.scripts.build).toBe('tsc -p tsconfig.build.json');
    const buildConfig = JSON.parse(await read('apps/api/tsconfig.build.json')) as { compilerOptions?: Record<string, unknown>; exclude?: string[] };
    expect(buildConfig.compilerOptions).toMatchObject({ noEmit: false, rootDir: 'src', outDir: 'dist' });
    expect(buildConfig.exclude).toEqual(expect.arrayContaining(['src/**/__tests__/**', 'src/bootstrap/e2e-server.ts']));
  });

  it('defines a PostGIS Render service with verification before migration', async () => {
    const render = await read('render.yaml');
    expect(render).toContain('buildCommand: npm ci --include=dev --no-audit --no-fund && npm run render-build');
    expect(render).toContain('preDeployCommand: npm run release:v2:predeploy');
    expect(render).toContain('startCommand: npm start');
    expect(render).toContain('healthCheckPath: /readyz');
    for (const name of ['DATABASE_URL', 'SESSION_SECRET', 'RELEASE_SHA', 'CLOUDINARY_CLOUD_NAME', 'VAPID_PUBLIC_KEY', 'SENTRY_DSN']) expect(render).toContain(`key: ${name}`);
    const staleNames = [['MONGO', 'DB_URI'].join(''), ['JWT', '_SECRET'].join(''), ['VITE_API', '_URL'].join(''), ['VITE_SOCKET', '_URL'].join('')];
    for (const name of staleNames) expect(render).not.toContain(name);
  });

  it('makes V2 gates and the root lock the only CI release graph', async () => {
    const workflow = await read('.github/workflows/ci.yml');
    expect(workflow).toContain('cache-dependency-path: package-lock.json');
    expect(workflow).toContain('needs: [v2-foundation]');
    expect(workflow).toContain('npm run render-build');
    expect(workflow).not.toMatch(/working-directory: (?:frontend|backend)|(?:frontend|backend)\/package-lock\.json/);
  });

  it('keeps Capacitor on the HTTPS V2 shell and removes stale env names', async () => {
    const capacitor = JSON.parse(await read('capacitor.config.json')) as { webDir: string; server?: { url?: string; cleartext?: boolean } };
    expect(capacitor.webDir).toBe('apps/web/dist');
    expect(capacitor.server?.url).toMatch(/^https:\/\//);
    expect(capacitor.server?.cleartext).toBe(false);
    const environment = await read('.env.v2.example');
    expect(environment).toContain('DATABASE_URL=');
    expect(environment).toContain('SESSION_SECRET=');
    for (const name of [['MONGO', 'DB_URI'].join(''), ['JWT', '_SECRET'].join(''), ['VITE_API', '_URL'].join(''), ['VITE_SOCKET', '_URL'].join('')]) expect(environment).not.toContain(name);
  });
});
