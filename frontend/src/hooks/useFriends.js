import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../api';

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
        api.get('/api/friends'),
        api.get('/api/friends/requests'),
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

  // ── Socket event listeners ────────────────────────────
  useEffect(() => {
    const socket = socketRef?.current;
    if (!socket) return;

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
      // Dispatch for global Toast (App.jsx will decide whether to show)
      window.dispatchEvent(new CustomEvent('ws:new_message', { detail: message }));
    };

    socket.on('friend:online', onFriendOnline);
    socket.on('friend:offline', onFriendOffline);
    socket.on('receive_message', onReceiveMessage);

    return () => {
      socket.off('friend:online', onFriendOnline);
      socket.off('friend:offline', onFriendOffline);
      socket.off('receive_message', onReceiveMessage);
    };
  }, [socketRef?.current]);

  // ── Friendship status for a target user ───────────────
  const friendshipStatus = useCallback((targetId) => {
    if (!targetId || !user) return 'self';
    if (user._id === targetId) return 'self';
    // 管理员（阿森）对所有人都是强制好友
    if (user.role === 'admin' || user.name === '阿森') return 'accepted';
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
    await api.post(`/api/friends/request/${targetId}`);
    outgoingRef.current.add(targetId);
  }, []);

  const acceptRequest = useCallback(async (friendshipId) => {
    await api.post(`/api/friends/accept/${friendshipId}`);
    await fetchFriends(); // Refresh list
  }, [fetchFriends]);

  const rejectRequest = useCallback(async (friendshipId) => {
    await api.post(`/api/friends/reject/${friendshipId}`);
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
