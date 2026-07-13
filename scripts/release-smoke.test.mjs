import test from 'node:test';
import assert from 'node:assert/strict';
import { runSmoke } from './release-smoke.mjs';

const RELEASE_SHA = '0123456789abcdef0123456789abcdef01234567';

function response(status, body, contentType = 'application/json') {
  return {
    status,
    headers: new Map([
      ['content-type', contentType],
      ['cache-control', 'no-store'],
      ['x-request-id', 'smoke-request-id'],
    ]),
    async json() { return body; },
    async text() { return typeof body === 'string' ? body : JSON.stringify(body); },
  };
}

test('release smoke validates required JSON, request id, and release checks', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith('/')) return response(200, '<!doctype html>', 'text/html');
    if (url.endsWith('/healthz')) return response(200, { status: 'ok', release: RELEASE_SHA });
    if (url.endsWith('/readyz')) return response(200, { ready: true });
    if (url.endsWith('/versionz')) return response(200, { release: RELEASE_SHA });
    if (url.includes('/api/activity') || url.includes('/api/map/footprints')) return response(200, {});
    if (url.includes('/api/auth/me')) return response(401, { error: 'Authentication required' });
    if (url.includes('/socket.io/')) return response(200, '0:open', 'text/plain');
    return response(404, {});
  };
  const lines = [];
  const result = await runSmoke({
    baseUrl: 'http://smoke.test',
    expectedRelease: RELEASE_SHA,
    fetchImpl,
    logger: (line) => lines.push(line),
  });

  assert.equal(result.ok, true);
  assert.ok(calls.some((url) => url.includes('/api/activity')));
  assert.ok(calls.some((url) => url.includes('/socket.io/')));
  assert.ok(lines.every((line) => /^(PASS|FAIL) /.test(line)));
});

test('release smoke fails closed without printing response bodies', async () => {
  const secret = 'mongodb://user:secret@host';
  const fetchImpl = async (url) => {
    if (url.endsWith('/')) return response(200, '<!doctype html>', 'text/html');
    return response(500, { error: secret });
  };
  const lines = [];
  const result = await runSmoke({
    baseUrl: 'http://smoke.test',
    expectedRelease: RELEASE_SHA,
    fetchImpl,
    logger: (line) => lines.push(line),
  });

  assert.equal(result.ok, false);
  assert.ok(lines.every((line) => !line.includes(secret)));
  assert.ok(lines.every((line) => /^(PASS|FAIL) /.test(line)));
});

test('release smoke fails before network when EXPECTED_RELEASE is missing', async () => {
  let calls = 0;
  const result = await runSmoke({
    baseUrl: 'http://smoke.test',
    expectedRelease: '',
    fetchImpl: async () => {
      calls += 1;
      return response(200, {});
    },
    logger: () => {},
  });

  assert.equal(result.ok, false);
  assert.equal(calls, 0);
  assert.equal(result.checks[0].name, 'configuration');
});

test('release smoke fails before network when EXPECTED_RELEASE is not a 40-hex SHA', async () => {
  let calls = 0;
  const result = await runSmoke({
    baseUrl: 'http://smoke.test',
    expectedRelease: 'not-a-release',
    fetchImpl: async () => {
      calls += 1;
      return response(200, {});
    },
    logger: () => {},
  });

  assert.equal(result.ok, false);
  assert.equal(calls, 0);
  assert.equal(result.checks[0].name, 'configuration');
});
