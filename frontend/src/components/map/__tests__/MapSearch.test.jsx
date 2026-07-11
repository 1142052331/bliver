import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MAP_QUERY } from '../../../domain/mapQuery';
import MapSearch from '../MapSearch';

const mocks = vi.hoisted(() => ({ search: vi.fn() }));

vi.mock('../../../api', () => ({
  apiClient: { map: { search: mocks.search } },
}));

function renderSearch(props = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    ...render(
    <QueryClientProvider client={queryClient}>
      <MapSearch
        query=""
        queryContext={DEFAULT_MAP_QUERY}
        onQueryChange={vi.fn()}
        onSelectPlace={vi.fn()}
        onSelectFootprint={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
    ),
  };
}

describe('MapSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces search for 300 ms and passes an abort signal', async () => {
    vi.useFakeTimers();
    mocks.search.mockResolvedValue({ data: { places: [], footprints: [], errors: {} } });
    const onQueryChange = vi.fn();
    renderSearch({ onQueryChange });

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索地点或足迹' }), {
      target: { value: '高知' },
    });
    await act(() => vi.advanceTimersByTimeAsync(299));
    expect(mocks.search).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));

    await act(async () => Promise.resolve());
    expect(mocks.search).toHaveBeenCalledTimes(1);
    expect(mocks.search).toHaveBeenCalledWith(
      { ...DEFAULT_MAP_QUERY, query: '高知' },
      { signal: expect.any(AbortSignal) },
    );
    expect(onQueryChange).toHaveBeenLastCalledWith('高知');
  });

  it('isolates authorized search cache entries by viewer', async () => {
    mocks.search.mockResolvedValue({ data: { places: [], footprints: [], errors: {} } });
    const { queryClient } = renderSearch({ query: 'Shanghai', viewerKey: 'viewer-1' });

    await waitFor(() => expect(mocks.search).toHaveBeenCalled());
    expect(queryClient.getQueryCache().getAll().map((entry) => entry.queryKey)).toContainEqual([
      'footprints', 'map-search', 'viewer-1',
      { ...DEFAULT_MAP_QUERY, query: 'Shanghai' },
    ]);
  });

  it('groups results and supports arrow/enter place selection', async () => {
    const place = { id: 'place-1', label: '日本高知市', lat: 33.56, lng: 133.53 };
    const footprint = { _id: 'fp-1', placeName: '高知城', userId: { name: '旅人' } };
    mocks.search.mockResolvedValueOnce({
      data: { places: [place], footprints: [footprint], errors: {} },
    });
    const onSelectPlace = vi.fn();
    const user = userEvent.setup();
    renderSearch({ onSelectPlace });
    const input = screen.getByRole('searchbox', { name: '搜索地点或足迹' });

    await user.type(input, '高知');
    await waitFor(() => expect(screen.getByRole('option', { name: /日本高知市/ })).toBeInTheDocument());
    expect(screen.getByText('地点')).toBeInTheDocument();
    expect(screen.getByText('足迹')).toBeInTheDocument();

    await user.keyboard('{ArrowDown}{Enter}');
    expect(onSelectPlace).toHaveBeenCalledWith(place);
  });

  it.each([
    [{ places: [{ id: 'p1', label: '高知市', lat: 1, lng: 2 }], footprints: [], errors: { footprints: '足迹搜索暂时不可用' } }, '高知市', '足迹搜索暂时不可用'],
    [{ places: [], footprints: [{ _id: 'f1', placeName: '高知城', userId: { name: '旅人' } }], errors: { places: '地点搜索暂时不可用' } }, '高知城', '地点搜索暂时不可用'],
  ])('keeps successful group results during a partial failure', async (data, resultName, errorText) => {
    mocks.search.mockResolvedValueOnce({ data });
    const user = userEvent.setup();
    renderSearch();

    await user.type(screen.getByRole('searchbox', { name: '搜索地点或足迹' }), '高知');
    await waitFor(() => expect(screen.getByText(resultName)).toBeInTheDocument());
    expect(screen.getByText(errorText)).toBeInTheDocument();
  });
});
