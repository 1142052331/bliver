import { describe, expect, it } from 'vitest';

import {
  buildOpenApiDocument,
  eventEnvelope,
  healthResponse,
  locationPrecision,
  mediaCompleteRequest,
  publishFootprintResponse,
  problemDetails,
  visibility,
} from '../index.js';

describe('V2 contracts', () => {
  it('accepts a typed health response', () => {
    const response = {
      status: 'ok',
      version: 'test',
      environment: 'test',
    } as const;

    expect(healthResponse.parse(response)).toEqual(response);
  });

  it('accepts RFC 9457 Problem Details with an application code', () => {
    expect(
      problemDetails.parse({
        type: 'about:blank',
        title: 'Invalid request',
        status: 400,
        code: 'VALIDATION_ERROR',
      }),
    ).toBeTruthy();
  });

  it('rejects unsupported visibility and location precision values', () => {
    expect(visibility.options).toEqual(['public', 'friends', 'private']);
    expect(locationPrecision.options).toEqual(['precise', 'approximate']);
    expect(() => visibility.parse('followers')).toThrow();
    expect(() => locationPrecision.parse('city')).toThrow();
  });

  it('validates event envelope fields and payloads', async () => {
    const { z } = await import('zod');
    const schema = eventEnvelope('platform.ready', z.object({ ready: z.boolean() }));

    expect(
      schema.parse({
        id: '018f5fd2-e002-7b51-bae6-4d18b27041b8',
        type: 'platform.ready',
        occurredAt: '2026-07-15T00:00:00.000Z',
        payload: { ready: true },
      }).payload,
    ).toEqual({ ready: true });
    expect(() =>
      schema.parse({
        id: 'not-an-id',
        type: 'platform.ready',
        occurredAt: '2026-07-15T00:00:00.000Z',
        payload: { ready: true },
      }),
    ).toThrow();
  });

  it('validates completed Cloudinary metadata', () => {
    expect(mediaCompleteRequest.parse({ version: 42, width: 1200, height: 900, format: 'jpg' })).toEqual({ version: 42, width: 1200, height: 900, format: 'jpg' });
    expect(() => mediaCompleteRequest.parse({ version: 42, width: 0, height: 900, format: 'jpg' })).toThrow();
  });

  it('models the wrapped publish response without exposing an unwrapped DTO contract', () => {
    const result = publishFootprintResponse.parse({
      footprint: {
        id: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b70',
        authorId: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b71',
        privatePoint: { lat: 31, lng: 121 },
        displayPoint: { lat: 31.001, lng: 121.001 },
        visibility: 'public',
        locationPrecision: 'approximate',
        message: 'Hello',
        mediaAssetIds: [],
        metadata: { placeId: null, regionId: null, weather: null },
        publishedAt: '2026-07-15T00:00:00.000Z',
        discoveryExpiresAt: null,
      },
      event: {
        id: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b72',
        type: 'FootprintPublished',
        aggregateId: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b70',
        payload: { footprintId: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b70', authorId: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b71' },
      },
    });
    expect(result.event.type).toBe('FootprintPublished');
  });

  it('publishes the foundation routes in an OpenAPI 3.1 document', () => {
    const document = buildOpenApiDocument();

    expect(document.openapi).toBe('3.1.0');
    expect(Object.keys(document.paths ?? {}).sort()).toEqual([
      '/api/v1/auth/login',
      '/api/v1/auth/logout',
      '/api/v1/auth/refresh',
      '/api/v1/auth/register',
      '/api/v1/footprints',
      '/api/v1/footprints/{footprintId}',
      '/api/v1/footprints/{footprintId}/visibility',
      '/api/v1/location/resolve',
      '/api/v1/map/footprints',
      '/api/v1/media/signature',
      '/api/v1/media/{assetId}',
      '/api/v1/media/{assetId}/complete',
      '/api/v1/places/search',
      '/api/v1/session',
      '/api/v1/sessions',
      '/api/v1/users/me',
      '/healthz',
      '/readyz',
      '/versionz',
    ]);
    expect(document.components?.schemas?.ProblemDetails).toBeDefined();
    expect(document.paths?.['/readyz']?.get?.responses?.[503]).toBeDefined();
    expect(document.paths?.['/api/v1/media/{assetId}']?.delete?.responses?.[204]).toBeDefined();
    expect(document.paths?.['/api/v1/media/{assetId}/complete']?.post?.responses?.[204]).toBeDefined();
    expect(document.paths?.['/api/v1/footprints']?.post?.responses?.[201]?.content?.['application/json']?.schema).toMatchObject({ '$ref': '#/components/schemas/PublishFootprintResponse' });
    expect(document.paths?.['/api/v1/footprints/{footprintId}']?.get?.responses?.[200]).toBeDefined();
    expect(document.paths?.['/api/v1/footprints/{footprintId}/visibility']?.patch?.responses?.[200]).toBeDefined();
    expect(document.paths?.['/api/v1/footprints/{footprintId}']?.delete?.responses?.[204]).toBeDefined();
    expect(document.paths?.['/api/v1/places/search']?.get?.responses?.[200]).toBeDefined();
    expect(document.paths?.['/api/v1/location/resolve']?.post?.responses?.[200]).toBeDefined();
  });
});
