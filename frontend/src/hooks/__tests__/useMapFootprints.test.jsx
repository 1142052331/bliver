import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MAP_QUERY } from '../../domain/mapQuery';
import useMapFootprints from '../useMapFootprints';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('../../api', () => ({
  apiClient: { map: { list: mocks.list } },
}));

describe('useMapFootprints', () => {
  let queryClient;
  let wrapper;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  });

  it('loads the authorized map response with a cancellation signal', async () => {
    const response = {
      footprints: [{ _id: 'fp-1' }],
      query: DEFAULT_MAP_QUERY,
      scopesUsed: ['global'],
    };
    mocks.list.mockResolvedValueOnce({ data: response });

    const { result } = renderHook(() => useMapFootprints(DEFAULT_MAP_QUERY), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(response);
    expect(mocks.list).toHaveBeenCalledWith(
      DEFAULT_MAP_QUERY,
      { signal: expect.any(AbortSignal) },
    );
    expect(queryClient.getQueryData(['footprints', 'map', DEFAULT_MAP_QUERY])).toEqual(response);
  });
});
