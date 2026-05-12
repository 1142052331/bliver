import { useEffect, useState } from 'react';
import { apiClient } from '../api';

/**
 * Fetches a user's profile info as fallback for non-friend chats (admin).
 * Resolves to the friend object if already in the friends list.
 */
export default function useChatFriendMeta(chatUserId, friends) {
  const [chatFriendMeta, setChatFriendMeta] = useState(null);

  useEffect(() => {
    if (!chatUserId) {
      setChatFriendMeta(null);
      return;
    }

    let cancelled = false;
    const existing = friends.find(f => f._id === chatUserId);

    if (existing) {
      setChatFriendMeta(existing);
    } else {
      apiClient.users.profile(chatUserId)
        .then(res => {
          if (!cancelled && res?.data?.user) {
            setChatFriendMeta({
              _id: chatUserId,
              name: res.data.user.name,
              avatarUrl: res.data.user.avatarUrl,
            });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setChatFriendMeta({ _id: chatUserId, name: '用户', avatarUrl: null });
          }
        });
    }

    return () => { cancelled = true; };
  }, [chatUserId, friends]);

  return chatFriendMeta;
}
