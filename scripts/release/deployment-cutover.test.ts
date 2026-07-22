import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { createConfig } from '../../apps/api/src/bootstrap/config.js';
import { validateAndroidDeepLinks } from '../capacitor/smoke.js';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): Promise<string> => readFile(resolve(root, path), 'utf8');

interface RenderEnvironmentVariable {
  readonly key: string;
  readonly value?: string;
  readonly sync?: boolean;
}

interface RenderWebService {
  readonly type: string;
  readonly name: string;
  readonly envVars: readonly RenderEnvironmentVariable[];
}

interface RenderBlueprint {
  readonly services: readonly RenderWebService[];
}

async function productionService(): Promise<RenderWebService> {
  const blueprint = parse(await read('render.yaml')) as RenderBlueprint;
  expect(blueprint.services).toHaveLength(1);
  return blueprint.services[0] as RenderWebService;
}

describe('V2 deployment cutover', () => {
  it('uses only root workspace build, predeploy, start, and exact-SHA commands', async () => {
    const pkg = JSON.parse(await read('package.json')) as { scripts: Record<string, string> };
    const renderBuild = pkg.scripts['render-build'] ?? '';
    expect(pkg.scripts.start).toBe('node apps/api/dist/bootstrap/server.js');
    expect(renderBuild).toContain('release:v2:verify-sha');
    expect(renderBuild).toContain('release:v2:verify-map-provider');
    expect(renderBuild).toContain('build:v2');
    expect(renderBuild).toContain('release:v2:verify-candidate');
    expect(renderBuild.indexOf('release:v2:verify-map-provider'))
      .toBeLessThan(renderBuild.indexOf('build:v2'));
    expect(pkg.scripts['release:v2:predeploy']).toBe('npm run release:v2:verify-candidate && npm run db:v2:migrate');
    for (const rootName of [['front', 'end'].join(''), ['back', 'end'].join('')]) expect(renderBuild).not.toContain(rootName);
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
    for (const name of [
      'DATABASE_URL',
      'SESSION_SECRET',
      'RELEASE_SHA',
      'CLOUDINARY_CLOUD_NAME',
      'VAPID_PUBLIC_KEY',
      'SENTRY_DSN',
      'VITE_MAP_STYLE_URL',
      'VITE_MAP_ATTRIBUTION_JSON',
      'MAP_PROVIDER_EMERGENCY',
      'MAP_PROVIDER_EMERGENCY_EXPIRES_AT',
    ]) expect(render).toContain(`key: ${name}`);
    const staleNames = [['MONGO', 'DB_URI'].join(''), ['JWT', '_SECRET'].join(''), ['VITE_API', '_URL'].join(''), ['VITE_SOCKET', '_URL'].join('')];
    for (const name of staleNames) expect(render).not.toContain(name);
  });

  it('boots runtime config from the final production Render Blueprint', async () => {
    const service = await productionService();
    const configured = Object.fromEntries(service.envVars.map(({ key, value }) => [key, value])) as NodeJS.ProcessEnv;
    const config = createConfig({
      ...configured,
      RELEASE_SHA: 'a'.repeat(40),
      DATABASE_URL: 'postgresql://test:test@localhost:5432/bliver',
      SESSION_SECRET: 'production-session-secret-that-is-long-enough',
    });
    expect(service).toMatchObject({ type: 'web', name: 'bliver' });
    expect(config).toMatchObject({ nodeEnv: 'production', deployEnv: 'production' });
  });

  it('makes V2 gates and the root lock the only CI release graph', async () => {
    const workflow = await read('.github/workflows/ci.yml');
    expect(workflow).toContain('cache-dependency-path: package-lock.json');
    expect(workflow).toContain('needs: [v2-foundation, visual-baselines]');
    expect(workflow).toContain('runs-on: windows-latest');
    expect(workflow).toContain('visual-baselines.spec.ts --project=mobile-390x844');
    expect(workflow).toContain('npm run render-build');
    expect(workflow).not.toMatch(/working-directory: (?:frontend|backend)|(?:frontend|backend)\/package-lock\.json/);
  });

  it('pins Capacitor and Android App Links to the final Render production service', async () => {
    const service = await productionService();
    const capacitor = JSON.parse(await read('capacitor.config.json')) as { webDir: string; server?: { url?: string; cleartext?: boolean } };
    const productionOrigin = `https://${service.name}.onrender.com`;
    expect(capacitor.webDir).toBe('apps/web/dist');
    expect(capacitor.server?.url).toBe(productionOrigin);
    expect(capacitor.server?.cleartext).toBe(false);
    expect(validateAndroidDeepLinks(await read('android/app/src/main/AndroidManifest.xml'), productionOrigin)).toEqual([]);
  });

  it('removes stale deployment environment names', async () => {
    const environment = await read('.env.v2.example');
    expect(environment).toContain('DATABASE_URL=');
    expect(environment).toContain('SESSION_SECRET=');
    for (const name of [['MONGO', 'DB_URI'].join(''), ['JWT', '_SECRET'].join(''), ['VITE_API', '_URL'].join(''), ['VITE_SOCKET', '_URL'].join('')]) expect(environment).not.toContain(name);
  });
});
