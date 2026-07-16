import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createConfig } from '../../bootstrap/config.js';
import { createApp } from '../app.js';
import { ObservabilityRegistry } from '../../platform/observability/index.js';

const config = createConfig({ NODE_ENV: 'test', DEPLOY_ENV: 'test', RELEASE_SHA: 'observability-test', DATABASE_URL: 'postgresql://test:test@localhost:5432/test', SESSION_SECRET: 'observability-session-secret-long-enough' });

describe('V2 observability HTTP contract', () => {
  it('propagates request and correlation ids and records safe request metrics', async () => {
    const registry = new ObservabilityRegistry();
    const response = await request(createApp({ config, observability: registry }))
      .get('/healthz')
      .set('x-request-id', 'request-observe-1')
      .set('x-correlation-id', 'correlation-observe-1');
    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBe('request-observe-1');
    expect(response.headers['x-correlation-id']).toBe('correlation-observe-1');
    expect(registry.snapshot().recentRequests[0]).toMatchObject({ requestId: 'request-observe-1', correlationId: 'correlation-observe-1', method: 'GET', status: 200 });
  });
});
