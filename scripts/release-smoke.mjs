#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

const DEFAULT_BASE_URL = 'http://localhost:5000';
const DEFAULT_TIMEOUT_MS = 10_000;
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/i;

function getHeader(response, name) {
  return response.headers?.get?.(name) || '';
}

async function fetchWithTimeout(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function runCheck({
  name,
  url,
  expectedStatus,
  contentType,
  noStore = false,
  requestId = false,
  validate = () => true,
}, { fetchImpl, timeoutMs, logger }) {
  let status = 'ERR';
  let pass = false;

  try {
    const response = await fetchWithTimeout(fetchImpl, url, timeoutMs);
    status = response.status;
    const actualContentType = getHeader(response, 'content-type').toLowerCase();
    const typeMatches = actualContentType.includes(contentType);
    const cacheMatches = !noStore || getHeader(response, 'cache-control').toLowerCase() === 'no-store';
    const requestIdMatches = !requestId || Boolean(getHeader(response, 'x-request-id'));
    let body;
    if (contentType === 'application/json') body = await response.json();
    else if (contentType === 'text/html') body = await response.text();

    pass = response.status === expectedStatus
      && typeMatches
      && cacheMatches
      && requestIdMatches
      && Boolean(await validate(body, response));
  } catch (_error) {
    pass = false;
  }

  logger(`${pass ? 'PASS' : 'FAIL'} ${name} status=${status}`);
  return { name, pass, status };
}

export async function runSmoke({
  baseUrl = process.env.BASE_URL || DEFAULT_BASE_URL,
  expectedRelease = process.env.EXPECTED_RELEASE || '',
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  logger = console.log,
} = {}) {
  if (typeof expectedRelease !== 'string' || !RELEASE_SHA_PATTERN.test(expectedRelease)) {
    logger('FAIL configuration status=ERR');
    return { ok: false, checks: [{ name: 'configuration', pass: false, status: 'ERR' }] };
  }

  let origin;
  try {
    origin = new URL(baseUrl).origin;
  } catch (_error) {
    logger('FAIL configuration status=ERR');
    return { ok: false, checks: [{ name: 'configuration', pass: false, status: 'ERR' }] };
  }

  if (typeof fetchImpl !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    logger('FAIL configuration status=ERR');
    return { ok: false, checks: [{ name: 'configuration', pass: false, status: 'ERR' }] };
  }

  const jsonCheck = (name, pathname, expectedStatus = 200, extras = {}) => ({
    name,
    url: new URL(pathname, origin).toString(),
    expectedStatus,
    contentType: 'application/json',
    requestId: true,
    ...extras,
  });
  const releaseMatches = (body) => body?.release === expectedRelease;
  const checks = [
    {
      name: 'root-html',
      url: new URL('/', origin).toString(),
      expectedStatus: 200,
      contentType: 'text/html',
      requestId: true,
      validate: (body) => typeof body === 'string' && /<!doctype\s+html/i.test(body),
    },
    jsonCheck('health', '/healthz', 200, { noStore: true, validate: releaseMatches }),
    jsonCheck('readiness', '/readyz', 200, {
      noStore: true,
      validate: (body) => body?.ready === true,
    }),
    jsonCheck('version', '/versionz', 200, { noStore: true, validate: releaseMatches }),
    jsonCheck('guest-activity', '/api/v1/activity?scope=global&limit=1'),
    jsonCheck('guest-map', '/api/v1/map/footprints?west=120&south=30&east=122&north=32'),
    jsonCheck('unauthenticated-protected', '/api/v1/users/me', 401),
    {
      name: 'socket-polling',
      url: new URL(`/socket.io/?EIO=4&transport=polling&t=${Date.now()}`, origin).toString(),
      expectedStatus: 200,
      contentType: 'text/plain',
    },
  ];

  const results = [];
  for (const check of checks) {
    results.push(await runCheck(check, { fetchImpl, timeoutMs, logger }));
  }
  return { ok: results.every((result) => result.pass), checks: results };
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const result = await runSmoke();
  process.exitCode = result.ok ? 0 : 1;
}
