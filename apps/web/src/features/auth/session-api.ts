import type { SessionDto } from '@bliver/contracts';

export async function fetchSession(): Promise<SessionDto> {
  const response = await fetch('/api/v1/session', {
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    method: 'GET',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { readonly code?: unknown };
    throw Object.assign(new Error(typeof body.code === 'string' ? body.code : 'REQUEST_FAILED'), {
      code: body.code,
      status: response.status,
    });
  }

  const { sessionDto } = await import('@bliver/contracts');
  return sessionDto.parse(await response.json());
}
