import { useEffect, useState, useCallback, useRef } from 'react';
import { apiClient } from '../api';
import useUIStore from '../store/useUIStore';
import { canBypassFriendship } from '../domain/superuser';
import { on, off } from './socketRegistry';

/**
 * 好友系统 hook — 数据拉取 + Socket 实时状态 + 好友操作
 *
 * 用法: const { friends, onlineStatus, friendshipStatus, ... } = useFriends({ user, socketRef });
 */
export default function useFriends({ user, socketRef }) {
  const [friends, setFriends] = useState([]);
  const [onlineStatus, setOnlineStatus] = useState({});  // { userId: true/false }
  const [unreadCounts, setUnreadCounts] = useState({});   // { senderId: count }
  const [pendingRequests, setPendingRequests] = useState([]);
  const outgoingRef = useRef(new Set()); // userIds I've sent requests to

  // ── Fetch friends + requests ──────────────────────────
  const fetchFriends = useCallback(async () => {
    try {
      const [fRes, rRes] = await Promise.all([
        apiClient.friends.list(),
        apiClient.friends.requests(),
      ]);
      const list = fRes.data.friends || [];
      setFriends(list);
      const status = {};
      list.forEach(f => { status[f._id] = f.isOnline || false; });
      setOnlineStatus(status);
      setPendingRequests(rRes.data.requests || []);
    } catch (err) {
      console.error('[useFriends] Fetch failed:', err);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchFriends();
    } else {
      setFriends([]);
      setOnlineStatus({});
      setPendingRequests([]);
      setUnreadCounts({});
      outgoingRef.current.clear();
    }
  }, [user, fetchFriends]);

  // ── Socket event listeners via registry ─────────────────
  useEffect(() => {
    const onFriendOnline = (data) => {
      setOnlineStatus(prev => ({ ...prev, [data.userId]: true }));
    };
    const onFriendOffline = (data) => {
      setOnlineStatus(prev => ({ ...prev, [data.userId]: false }));
    };
    const onReceiveMessage = (data) => {
      const { message } = data;
      if (!message?.senderId) return;
      setUnreadCounts(prev => ({
        ...prev,
        [message.senderId]: (prev[message.senderId] || 0) + 1,
      }));
      // Show MessageIsland if chat window is not focused on this sender
      const s = useUIStore.getState();
      if (message?.senderId && s.chatUserId !== message.senderId) {
        s.setMessageIsland({
          type: 'message',
          senderId: message.senderId,
          senderName: message._senderName || '好友',
        });
      }
    };

    on('friend:online', onFriendOnline);
    on('friend:offline', onFriendOffline);
    on('receive_message', onReceiveMessage);

    return () => {
      off('friend:online', onFriendOnline);
      off('friend:offline', onFriendOffline);
      off('receive_message', onReceiveMessage);
    };
  }, []);

  // ── Friendship status for a target user ───────────────
  const friendshipStatus = useCallback((targetId) => {
    if (!targetId || !user) return 'self';
    if (user._id === targetId) return 'self';
    // 管理员（阿森）对所有人都是强制好友
    if (canBypassFriendship(user)) return 'accepted';
    if (friends.some(f => f._id === targetId)) return 'accepted';
    if (outgoingRef.current.has(targetId)) return 'pending_out';
    if (pendingRequests.some(r => r.requester?._id === targetId)) return 'pending_in';
    return 'none';
  }, [friends, pendingRequests, user]);

  // ── Find incoming pending request ID for a user ───────
  const getPendingRequestId = useCallback((targetId) => {
    const req = pendingRequests.find(r => r.requester?._id === targetId);
    return req?._id || null;
  }, [pendingRequests]);

  // ── Actions ───────────────────────────────────────────
  const sendFriendRequest = useCallback(async (targetId) => {
    await apiClient.friends.sendRequest(targetId);
    outgoingRef.current.add(targetId);
  }, []);

  const acceptRequest = useCallback(async (friendshipId) => {
    await apiClient.friends.accept(friendshipId);
    await fetchFriends(); // Refresh list
  }, [fetchFriends]);

  const rejectRequest = useCallback(async (friendshipId) => {
    await apiClient.friends.reject(friendshipId);
    setPendingRequests(prev => prev.filter(r => r._id !== friendshipId));
    await fetchFriends();
  }, [fetchFriends]);

  const clearUnread = useCallback((chatUserId) => {
    setUnreadCounts(prev => {
      if (!prev[chatUserId]) return prev;
      const next = { ...prev };
      delete next[chatUserId];
      return next;
    });
    // Also refresh friends to get updated isOnline
    fetchFriends();
  }, [fetchFriends]);

  return {
    friends,
    onlineStatus,
    unreadCounts,
    pendingRequests,
    friendshipStatus,
    getPendingRequestId,
    sendFriendRequest,
    acceptRequest,
    rejectRequest,
    clearUnread,
    refresh: fetchFriends,
  };
}
