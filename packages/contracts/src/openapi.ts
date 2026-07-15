import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';

import { problemDetails } from './errors.js';
import { healthResponse } from './health.js';
import { authResponse, loginRequest, publicUser, registerRequest, refreshRequest } from './auth.js';
import { sessionDto, sessionListResponse } from './session.js';
import { footprintDto, footprintRecordResponse, mapFootprintsResponse, publishFootprintRequest, publishFootprintResponse, updateFootprintVisibilityRequest } from './footprints.js';
import { mediaCompleteRequest, mediaSignatureRequest, mediaSignatureResponse } from './media.js';
import { locationResolveRequest, locationResolveResponse, placeSearchResponse } from './geography.js';
import { z } from './zod.js';

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  const healthSchema = registry.register('HealthResponse', healthResponse);
  const problemSchema = registry.register('ProblemDetails', problemDetails);
  const userSchema = registry.register('PublicUser', publicUser);
  const registerSchema = registry.register('RegisterRequest', registerRequest);
  const loginSchema = registry.register('LoginRequest', loginRequest);
  const refreshSchema = registry.register('RefreshRequest', refreshRequest);
  const authSchema = registry.register('AuthResponse', authResponse);
  const sessionSchema = registry.register('Session', sessionDto);
  const sessionsSchema = registry.register('SessionListResponse', sessionListResponse);
  const footprintSchema = registry.register('Footprint', footprintDto);
  const footprintRecordSchema = registry.register('FootprintRecordResponse', footprintRecordResponse);
  const mapSchema = registry.register('MapFootprintsResponse', mapFootprintsResponse);
  const mediaRequestSchema = registry.register('MediaSignatureRequest', mediaSignatureRequest);
  const mediaSchema = registry.register('MediaSignatureResponse', mediaSignatureResponse);
  const mediaCompleteSchema = registry.register('MediaCompleteRequest', mediaCompleteRequest);
  const publishSchema = registry.register('PublishFootprintRequest', publishFootprintRequest);
  const publishResponseSchema = registry.register('PublishFootprintResponse', publishFootprintResponse);
  const visibilitySchema = registry.register('UpdateFootprintVisibilityRequest', updateFootprintVisibilityRequest);
  const placeSearchResponseSchema = registry.register('PlaceSearchResponse', placeSearchResponse);
  const locationResolveRequestSchema = registry.register('LocationResolveRequest', locationResolveRequest);
  const locationResolveResponseSchema = registry.register('LocationResolveResponse', locationResolveResponse);
  const mediaAssetParams = z.object({ assetId: z.string().uuid() });
  const footprintParams = z.object({ footprintId: z.string().uuid() });
  const placeSearchQuery = z.object({ q: z.string().trim().min(1).max(120) });

  for (const path of ['/healthz', '/versionz'] as const) {
    registry.registerPath({
      method: 'get',
      path,
      responses: {
        200: {
          description: 'The service is healthy',
          content: {
            'application/json': { schema: healthSchema },
          },
        },
      },
    });
  }

  registry.registerPath({
    method: 'get',
    path: '/readyz',
    responses: {
      200: {
        description: 'The service is ready',
        content: {
          'application/json': { schema: healthSchema },
        },
      },
      503: {
        description: 'The database is unavailable',
        content: {
          'application/problem+json': { schema: problemSchema },
        },
      },
    },
  });

  registry.registerPath({ method: 'post', path: '/api/v1/auth/register', request: { body: { content: { 'application/json': { schema: registerSchema } } } }, responses: { 201: { description: 'Registered', content: { 'application/json': { schema: authSchema } } }, 400: { description: 'Invalid input', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'post', path: '/api/v1/auth/login', request: { body: { content: { 'application/json': { schema: loginSchema } } } }, responses: { 200: { description: 'Authenticated', content: { 'application/json': { schema: authSchema } } }, 401: { description: 'Invalid credentials', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'post', path: '/api/v1/auth/refresh', request: { body: { content: { 'application/json': { schema: refreshSchema } } } }, responses: { 200: { description: 'Rotated credentials', content: { 'application/json': { schema: authSchema } } }, 401: { description: 'Invalid refresh token', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'post', path: '/api/v1/auth/logout', responses: { 204: { description: 'Signed out' } } });
  registry.registerPath({ method: 'get', path: '/api/v1/session', responses: { 200: { description: 'Current session', content: { 'application/json': { schema: sessionSchema } } } } });
  registry.registerPath({ method: 'get', path: '/api/v1/users/me', responses: { 200: { description: 'Current user', content: { 'application/json': { schema: userSchema } } } } });
  registry.registerPath({ method: 'get', path: '/api/v1/sessions', responses: { 200: { description: 'Sessions', content: { 'application/json': { schema: sessionsSchema } } } } });
  registry.registerPath({ method: 'post', path: '/api/v1/media/signature', request: { body: { content: { 'application/json': { schema: mediaRequestSchema } } } }, responses: { 200: { description: 'Signed upload parameters', content: { 'application/json': { schema: mediaSchema } } } } });
  registry.registerPath({ method: 'delete', path: '/api/v1/media/{assetId}', request: { params: mediaAssetParams }, responses: { 204: { description: 'Media asset deleted' }, 401: { description: 'Authentication required', content: { 'application/problem+json': { schema: problemSchema } } }, 404: { description: 'Media asset not found', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'post', path: '/api/v1/media/{assetId}/complete', request: { params: mediaAssetParams, body: { content: { 'application/json': { schema: mediaCompleteSchema } } } }, responses: { 204: { description: 'Media metadata reconciled' }, 400: { description: 'Invalid metadata', content: { 'application/problem+json': { schema: problemSchema } } }, 401: { description: 'Authentication required', content: { 'application/problem+json': { schema: problemSchema } } }, 404: { description: 'Media asset not found', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'get', path: '/api/v1/footprints/{footprintId}', request: { params: footprintParams }, responses: { 200: { description: 'Footprint detail', content: { 'application/json': { schema: footprintSchema } } }, 404: { description: 'Footprint not found', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'post', path: '/api/v1/footprints', request: { body: { content: { 'application/json': { schema: publishSchema } } } }, responses: { 201: { description: 'Published footprint and outbox event', content: { 'application/json': { schema: publishResponseSchema } } }, 400: { description: 'Invalid publish request', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'patch', path: '/api/v1/footprints/{footprintId}/visibility', request: { params: footprintParams, body: { content: { 'application/json': { schema: visibilitySchema } } } }, responses: { 200: { description: 'Updated footprint visibility', content: { 'application/json': { schema: footprintRecordSchema } } }, 400: { description: 'Invalid visibility', content: { 'application/problem+json': { schema: problemSchema } } }, 409: { description: 'Footprint conflict', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'delete', path: '/api/v1/footprints/{footprintId}', request: { params: footprintParams }, responses: { 204: { description: 'Footprint deleted' }, 409: { description: 'Footprint conflict', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'get', path: '/api/v1/places/search', request: { query: placeSearchQuery }, responses: { 200: { description: 'Place search results', content: { 'application/json': { schema: placeSearchResponseSchema } } }, 400: { description: 'Invalid place query', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'post', path: '/api/v1/location/resolve', request: { body: { content: { 'application/json': { schema: locationResolveRequestSchema } } } }, responses: { 200: { description: 'Resolved place and weather', content: { 'application/json': { schema: locationResolveResponseSchema } } }, 400: { description: 'Invalid location', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'get', path: '/api/v1/map/footprints', responses: { 200: { description: 'Map footprints', content: { 'application/json': { schema: mapSchema } } } } });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Bliver V2 API',
      version: '0.1.0',
    },
  });
}
