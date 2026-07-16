import { describe, expect, it } from 'vitest';

import { ObservabilityRegistry, configureSentryRelease, hashActorId } from '../index.js';

describe('V2 observability registry', () => {
  it('hashes actor ids deterministically without logging the raw identifier', () => {
    const first = hashActorId('019f0000-0000-7000-8000-000000000001', 'test-salt');
    expect(first).toHaveLength(64);
    expect(first).toBe(hashActorId('019f0000-0000-7000-8000-000000000001', 'test-salt'));
    expect(first).not.toContain('019f0000');
  });

  it('records request, socket, outbox and dependency metrics with safe dimensions', () => {
    const logs: Record<string, unknown>[] = [];
    const registry = new ObservabilityRegistry('test-salt', { info(fields) { logs.push(fields); } });
    registry.request({ requestId: 'request-1', correlationId: 'correlation-1', method: 'GET', status: 503, durationMs: 12, actorId: 'actor-1' });
    registry.socket('connection');
    registry.socket('reconnect');
    registry.outbox('retry');
    registry.dependency('dbPool', false);
    registry.dependency('slowQuery', false);
    registry.dependency('cloudinary', false);
    registry.dependency('geocoder', false);
    registry.dependency('push', false);
    const snapshot = registry.snapshot();
    expect(snapshot.counters).toMatchObject({ requests: 1, errors: 1, socketConnections: 1, socketReconnects: 1, outboxRetries: 1, dbPoolFailures: 1, slowQueryFailures: 1, cloudinaryFailures: 1, geocoderFailures: 1, pushFailures: 1 });
    expect(snapshot.recentRequests[0]).toMatchObject({ requestId: 'request-1', correlationId: 'correlation-1', actorHash: expect.any(String) });
    expect(JSON.stringify(snapshot)).not.toContain('actor-1');
    expect(JSON.stringify(logs)).not.toContain('actor-1');
    expect(logs).toContainEqual(expect.objectContaining({ event: 'http.request', requestId: 'request-1', correlationId: 'correlation-1', status: 503, durationMs: 12, actorHash: expect.any(String) }));
    expect(logs).toContainEqual(expect.objectContaining({ event: 'socket.connection' }));
    expect(logs).toContainEqual(expect.objectContaining({ event: 'outbox.retry' }));
  });

  it('sets Sentry release and environment tags without event payloads', () => {
    const tags: Record<string, string> = {};
    configureSentryRelease({ setTag(name, value) { tags[name] = value; } }, 'release-1', 'staging');
    expect(tags).toEqual({ release: 'release-1', environment: 'staging' });
  });
});
