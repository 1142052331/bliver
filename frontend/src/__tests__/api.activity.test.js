import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  useRequestInterceptor: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: () => ({
      get: mocks.get,
      interceptors: { request: { use: mocks.useRequestInterceptor } },
    }),
  },
}));

describe('activity API adapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('omits defaults and safely encodes fixed scope pagination', () => {
    const opts = { signal: new AbortController().signal };

    apiClient.activity.list({}, undefined, opts);
    apiClient.activity.list({
      scope: 'region', countryCode: 'cn', regionCode: 'cn-sh', limit: 12,
    }, 'opaque+/=', opts);

    expect(mocks.get).toHaveBeenNthCalledWith(1, '/api/activity', opts);
    expect(mocks.get).toHaveBeenNthCalledWith(
      2,
      '/api/activity?scope=region&countryCode=CN&regionCode=CN-SH&limit=12&cursor=opaque%2B%2F%3D',
      opts,
    );
  });
});
