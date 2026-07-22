import {
  publicProfilesResponse,
  publicUser,
  type PublicProfile,
} from '@bliver/contracts';

export type { PublicProfile } from '@bliver/contracts';

export class IdentityApiError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = 'IdentityApiError';
  }
}

async function json(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = body && typeof body === 'object' && 'code' in body
      ? String((body as { code?: unknown }).code)
      : 'IDENTITY_REQUEST_FAILED';
    throw new IdentityApiError(code, response.status);
  }
  return body;
}

export async function fetchCurrentUser(): Promise<PublicProfile> {
  const { id, username, displayName } = publicUser.parse(
    await json(await fetch('/api/v1/users/me', { credentials: 'include' })),
  );
  return { id, username, displayName };
}

const publicProfileBatchSize = 100;

async function fetchPublicProfileBatch(ids: readonly string[]): Promise<PublicProfile[]> {
  const search = new URLSearchParams({ ids: ids.join(',') });
  return publicProfilesResponse.parse(
    await json(await fetch(`/api/v1/users?${search.toString()}`, { credentials: 'include' })),
  ).items;
}

export async function fetchPublicProfiles(userIds: readonly string[]): Promise<PublicProfile[]> {
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return [];
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += publicProfileBatchSize) {
    batches.push(ids.slice(index, index + publicProfileBatchSize));
  }
  return (await Promise.all(batches.map(fetchPublicProfileBatch))).flat();
}
