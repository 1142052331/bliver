import { extname, resolve } from 'node:path';

import express from 'express';

const reservedPaths = ['/healthz', '/readyz', '/versionz'] as const;

function isReserved(path: string): boolean {
  return path === '/api'
    || path.startsWith('/api/')
    || path === '/socket.io'
    || path.startsWith('/socket.io/')
    || reservedPaths.includes(path as (typeof reservedPaths)[number]);
}

export function createStaticWebHandlers(distInput: string): express.Router {
  const dist = resolve(distInput);
  const router = express.Router();
  const assets = express.static(dist, { fallthrough: true, index: 'index.html' });

  router.use((request, response, next) => {
    if (isReserved(request.path)) return next();
    return assets(request, response, next);
  });
  router.use((request, response, next) => {
    if ((request.method !== 'GET' && request.method !== 'HEAD')
      || isReserved(request.path)
      || extname(request.path) !== '') return next();
    return response.sendFile('index.html', { root: dist });
  });
  return router;
}
