import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api';

export const conversationKeys = {
  all: ['conversations'],
  detail: (id) => ['conversations', id],
  settings: ['message-settings'],
};

export default function useConversations({ enabled = true } = {}) {
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    queryKey: conversationKeys.all,
    queryFn: async () => (await apiClient.conversations.list()).data.conversations || [],
    enabled,
  });
  const settingsQuery = useQuery({
    queryKey: conversationKeys.settings,
    queryFn: async () => (await apiClient.conversations.settings()).data,
    enabled,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: conversationKeys.all });
  const mutation = (fn) => useMutation({ mutationFn: fn, onSuccess: invalidate });
  const sendGreeting = mutation(({ userId, content }) => apiClient.conversations.greeting(userId, content));
  const reply = mutation(({ id, content }) => apiClient.conversations.reply(id, content));
  const ignore = mutation((id) => apiClient.conversations.ignore(id));
  const remove = mutation((id) => apiClient.conversations.remove(id));
  const block = mutation((userId) => apiClient.conversations.block(userId));
  const unblock = mutation((userId) => apiClient.conversations.unblock(userId));
  const updateSettings = useMutation({
    mutationFn: (value) => apiClient.conversations.updateSettings(value),
    onSuccess: ({ data }) => queryClient.setQueryData(conversationKeys.settings, data),
  });
  return { ...listQuery, conversations: listQuery.data || [], settings: settingsQuery.data, sendGreeting, reply, ignore, remove, block, unblock, updateSettings };
}
