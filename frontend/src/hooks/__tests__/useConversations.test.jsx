import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useConversations from '../useConversations';

const mocks = vi.hoisted(() => ({
  block: vi.fn(),
  greeting: vi.fn(),
  ignore: vi.fn(),
  remove: vi.fn(),
  reply: vi.fn(),
  unblock: vi.fn(),
}));

vi.mock('../../api', () => ({
  apiClient: {
    conversations: {
      block: mocks.block,
      greeting: mocks.greeting,
      ignore: mocks.ignore,
      list: vi.fn(),
      remove: mocks.remove,
      reply: mocks.reply,
      settings: vi.fn(),
      unblock: mocks.unblock,
      updateSettings: vi.fn(),
    },
  },
}));

describe('useConversations mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(mocks).forEach((mock) => mock.mockResolvedValue({ data: {} }));
  });

  it.each([
    ['sendGreeting', { userId: 'user-1', content: 'hello' }, 'greeting', ['user-1', 'hello']],
    ['reply', { id: 'conversation-1', content: 'reply' }, 'reply', ['conversation-1', 'reply']],
    ['ignore', 'conversation-1', 'ignore', ['conversation-1']],
    ['remove', 'conversation-1', 'remove', ['conversation-1']],
    ['block', 'user-1', 'block', ['user-1']],
    ['unblock', 'user-1', 'unblock', ['user-1']],
  ])('maps %s arguments and invalidates the conversation list', async (
    action,
    input,
    apiMethod,
    expectedArgs,
  ) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useConversations({ enabled: false }), { wrapper });

    await act(async () => {
      await result.current[action].mutateAsync(input);
    });

    expect(mocks[apiMethod]).toHaveBeenCalledWith(...expectedArgs);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['conversations'] });
  });
});
