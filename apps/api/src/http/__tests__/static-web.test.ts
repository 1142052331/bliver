import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createStaticWebHandlers } from '../static-web.js';

const fixtures: string[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function productionApp() {
  const dist = await mkdtemp(join(tmpdir(), 'bliver-static-web-'));
  fixtures.push(dist);
  await mkdir(join(dist, 'assets'));
  await writeFile(join(dist, 'index.html'), '<!doctype html><main>Bliver V2</main>');
  await writeFile(join(dist, 'assets/app.js'), 'export {};');
  const app = express();
  app.get('/api/v1/ping', (_request, response) => response.json({ ok: true }));
  app.get('/healthz', (_request, response) => response.json({ status: 'ok' }));
  app.use(createStaticWebHandlers(dist));
  app.use((_request, response) => response.status(404).type('application/problem+json').send({ code: 'NOT_FOUND' }));
  return app;
}

describe('same-origin V2 production web', () => {
  it('serves the V2 shell and an existing immutable asset', async () => {
    const app = await productionApp();
    const root = await request(app).get('/').expect(200);
    const asset = await request(app).get('/assets/app.js').expect(200);
    expect(root.text).toContain('Bliver V2');
    expect(asset.type).toMatch(/javascript/);
  });

  it('falls back to index only for route-like GET requests', async () => {
    const app = await productionApp();
    await request(app).get('/memories/timeline').expect(200, /Bliver V2/);
    const missingAsset = await request(app).get('/assets/missing.js').expect(404);
    expect(missingAsset.type).toMatch(/application\/problem\+json/);
  });

  it('never intercepts API, Socket.IO, or health namespaces', async () => {
    const app = await productionApp();
    await request(app).get('/api/v1/ping').expect(200, { ok: true });
    await request(app).get('/api/v1/missing').expect(404);
    await request(app).get('/socket.io/unknown').expect(404);
    await request(app).get('/healthz').expect(200, { status: 'ok' });
  });
});
