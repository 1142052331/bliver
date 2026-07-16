import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createErrorHandler } from '../error-handler.js';

describe('HTTP error reporting', () => {
  it('reports terminal 5xx failures without forwarding request or exception secrets', async () => {
    const reporter = { capture: vi.fn() };
    const app = express();
    app.use((incoming, _response, next) => {
      incoming.id = 'request-safe-1';
      (incoming as typeof incoming & { correlationId?: string }).correlationId = 'correlation-safe-1';
      next();
    });
    app.use(express.json());
    app.post('/fail', () => {
      throw new Error('exception-secret token-secret 31.234567,121.456789');
    });
    app.use(createErrorHandler(reporter));

    const response = await request(app)
      .post('/fail?token=query-secret')
      .set('authorization', 'Bearer header-secret')
      .send({ message: 'body-secret', latitude: 31.234567, longitude: 121.456789 });

    expect(response.status).toBe(500);
    expect(reporter.capture).toHaveBeenCalledOnce();
    expect(reporter.capture).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Unhandled HTTP request failure' }),
      {
        requestId: 'request-safe-1',
        correlationId: 'correlation-safe-1',
        method: 'POST',
        status: 500,
      },
    );
    const report = `${String(reporter.capture.mock.calls[0]?.[0])} ${JSON.stringify(reporter.capture.mock.calls[0]?.[1])}`;
    for (const sensitive of ['exception-secret', 'token-secret', 'query-secret', 'header-secret', 'body-secret', '31.234567', '121.456789']) {
      expect(report).not.toContain(sensitive);
    }
  });

  it('does not report invalid or oversized JSON as server failures', async () => {
    const reporter = { capture: vi.fn() };
    const app = express();
    app.use((incoming, _response, next) => {
      incoming.id = 'request-client-error';
      next();
    });
    app.use(express.json({ limit: '16b' }));
    app.post('/payload', (_incoming, response) => response.sendStatus(204));
    app.use(createErrorHandler(reporter));

    await request(app)
      .post('/payload')
      .set('content-type', 'application/json')
      .send('{"invalid"')
      .expect(400);
    await request(app)
      .post('/payload')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ content: 'payload-too-large' }))
      .expect(413);

    expect(reporter.capture).not.toHaveBeenCalled();
  });
});
