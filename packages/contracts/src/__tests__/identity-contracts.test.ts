import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../openapi.js';
import { authResponse, loginRequest, registerRequest, sessionDto } from '../index.js';

describe('identity contracts', () => {
  it('validates auth input and keeps private credentials out of DTOs', () => {
    expect(registerRequest.safeParse({ username: 'alice', password: 'password-123' }).success).toBe(true);
    expect(loginRequest.safeParse({ username: 'alice', password: 'password-123', platform: 'web' }).success).toBe(true);
    const parsed = authResponse.parse({ user: { id: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b70', username: 'alice', displayName: 'Alice', email: null, roles: ['user'] }, session: { id: '019c2f52-3e9b-7d1f-8d68-cf35d75d9b70', deviceName: 'Web', createdAt: '2026-01-01T00:00:00.000Z', lastSeenAt: '2026-01-01T00:00:00.000Z', current: true } });
    expect(parsed).not.toHaveProperty('passwordHash');
    expect(sessionDto.shape).toBeDefined();
  });
  it('publishes identity paths in OpenAPI', () => {
    const document = buildOpenApiDocument() as { paths: Record<string, unknown> };
    expect(document.paths['/api/v1/auth/login']).toBeDefined();
    expect(document.paths['/api/v1/users/me']).toBeDefined();
  });
});
