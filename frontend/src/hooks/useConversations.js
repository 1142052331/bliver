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
  const sendGreeting = useMutation({
    mutationFn: ({ userId, content }) => apiClient.conversations.greeting(userId, content),
    onSuccess: invalidate,
  });
  const reply = useMutation({
    mutationFn: ({ id, content }) => apiClient.conversations.reply(id, content),
    onSuccess: invalidate,
  });
  const ignore = useMutation({
    mutationFn: (id) => apiClient.conversations.ignore(id),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id) => apiClient.conversations.remove(id),
    onSuccess: invalidate,
  });
  const block = useMutation({
    mutationFn: (userId) => apiClient.conversations.block(userId),
    onSuccess: invalidate,
  });
  const unblock = useMutation({
    mutationFn: (userId) => apiClient.conversations.unblock(userId),
    onSuccess: invalidate,
  });
  const updateSettings = useMutation({
    mutationFn: (value) => apiClient.conversations.updateSettings(value),
    onSuccess: ({ data }) => queryClient.setQueryData(conversationKeys.settings, data),
  });
  return { ...listQuery, conversations: listQuery.data || [], settings: settingsQuery.data, sendGreeting, reply, ignore, remove, block, unblock, updateSettings };
}
