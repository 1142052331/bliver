import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';

import { problemDetails } from './errors.js';
import { healthResponse } from './health.js';
import { authResponse, loginRequest, publicUser, registerRequest, refreshRequest } from './auth.js';
import { sessionDto, sessionListResponse } from './session.js';

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

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Bliver V2 API',
      version: '0.1.0',
    },
  });
}
