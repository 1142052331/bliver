import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { MapContainer, TileLayer } from 'react-leaflet';
import api from './api';
import { getUser, getToken, clearAuth, saveAuth, isAutoLogin } from './auth';
import { broadcastLogin, broadcastLogout, listenAuthSync } from './authSync';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { MapPin, Image, Clock, Megaphone } from 'lucide-react';

import NavBar from './components/NavBar';
import AuthModal from './components/AuthModal';
import CheckInModal from './components/CheckInModal';
import TimelineDrawer from './components/TimelineDrawer';
import ClusterMarkers from './components/ClusterMarkers';
import ClusterDetailPanel from './components/ClusterDetailPanel';
import NotificationPanel from './components/NotificationPanel';
import AdminPanel from './components/AdminPanel';
import FlyToFootprint from './components/FlyToFootprint';
import RecenterOnLoad from './components/RecenterOnLoad';
import PanToTarget from './components/PanToTarget';
import GlobalToaster from './components/GlobalToaster';
import AboutModal from './components/AboutModal';
import ProfileDrawer from './components/ProfileDrawer';
import FootprintDetailModal from './components/FootprintDetailModal';
import ErrorBoundary from './components/ErrorBoundary';
import PhotoWall from './components/PhotoWall';
import MapResizeHandler from './components/MapResizeHandler';
import AnnouncementPanel, { hasUnreadAnnouncements } from './components/AnnouncementPanel';
import FriendsPanel from './components/FriendsPanel';
import ChatWindow from './components/ChatWindow';
import MessageIsland from './components/MessageIsland';
import MobileActionDrawer from './components/MobileActionDrawer';
import useUIStore from './store/useUIStore';
import useSocket from './hooks/useSocket';
import useFriends from './hooks/useFriends';
import useFootprints from './hooks/useFootprints';
import { subscribeToPush } from './push';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const CENTER = [33.5597, 133.5311];

export default function App() {
  // ── Core state ────────────────────────────────────────
  const [user, setUser] = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [announceHasUnread, setAnnounceHasUnread] = useState(false);
  const [footprintPeriod, setFootprintPeriod] = useState('week');

  // ── React Query: footprints ────────────────────────────
  const queryClient = useQueryClient();
  const periodRef = useRef(footprintPeriod);
  periodRef.current = footprintPeriod;
  const { data: footprints = [], isLoading: footprintsLoading, refetch: refetchFootprints } = useFootprints(footprintPeriod);

  // Stable cache updater for socket/mutations (uses ref to avoid stale period)
  const setFootprints = useCallback((updater) => {
    queryClient.setQueryData(['footprints', periodRef.current], (old) => {
      if (typeof updater === 'function') return updater(old || []);
      return updater;
    });
  }, [queryClient]);

  // ── UI state (Zustand) ────────────────────────────────
  const {
    showCheckIn, showTimeline, showNotifs, showAdmin, showAuth,
    showPhotoWall, showAbout, showAnnouncements, showFriends,
    chatUserId, viewingProfileId,
    authTab, authMessage,
    shareTarget, clusterData, activeFootprintId, flyArrivedFp, timelineTargetFpId,
    openCheckIn, closeCheckIn, openTimeline, closeTimeline,
    toggleNotifs, closeNotifs, openAdmin, closeAdmin,
    openAuth, closeAuth, openPhotoWall, closePhotoWall,
    openAbout, closeAbout, openAnnouncements, closeAnnouncements,
    openFriends, closeFriends,
    setActiveFootprintId, setFlyArrivedFp, setTimelineTargetFpId,
    setClusterData, setShareTarget,
    openChat, closeChat, openProfile, closeProfile,
    setAuthTab, setAuthMessage,
    messageIsland, setMessageIsland, clearMessageIsland,
  } = useUIStore();

  // ── Refs ──────────────────────────────────────────────
  const pendingActionRef = useRef(null);
  const { socketRef } = useSocket({
    user, setUser, setFootprints, setNotifications, setOnlineCount,
  });

  const {
    friends, onlineStatus, unreadCounts, pendingRequests,
    friendshipStatus, getPendingRequestId,
    sendFriendRequest, acceptRequest, rejectRequest, clearUnread,
  } = useFriends({ user, socketRef });

  // ── Unread notification counter ────────────────────────
  const READ_COUNT_KEY = 'bliver_unread_v1';
  const [unreadCount, setUnreadCount] = useState(() => {
    try { return parseInt(localStorage.getItem(READ_COUNT_KEY), 10) || 0; }
    catch { return 0; }
  });

  // Sync counter from server notifications on mount / change
  useEffect(() => {
    if (notifications.length > 0) {
      const count = notifications.filter((n) => !n.isRead).length;
      setUnreadCount(count);
      try { localStorage.setItem(READ_COUNT_KEY, String(count)); } catch {}
    }
  }, [notifications]);

  // ── Auto-login on mount ───────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    const saved = getUser();
    if (saved && getToken() && isAutoLogin()) {
      api.get('/api/auth/me', { signal: controller.signal }).then((res) => {
        const u = res.data.user;
        setUser(u);
        // Don't overwrite localStorage on auto-login — prevents cross-tab write storm
        subscribeToPush().catch(() => {});
      }).catch((err) => {
        if (err.name === 'CanceledError') return;
        clearAuth();
        setUser(null);
      });
    }
    return () => controller.abort();
  }, []);

  // ── Parse ?fp= share link ─────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fpId = params.get('fp');
    if (fpId) {
      setShareTarget(fpId);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // ── Visibility change + focus: refresh data + wake zombie socket ──
  const visibilityAbortRef = useRef(null);
  useEffect(() => {
    const wakeSocket = () => {
      if (!user) return;
      if (socketRef.current && !socketRef.current.connected) {
        socketRef.current.connect();
        socketRef.current.emit('user:online');
      }
    };

    const refreshData = () => {
      if (!user) return;
      if (visibilityAbortRef.current) visibilityAbortRef.current.abort();
      const controller = new AbortController();
      visibilityAbortRef.current = controller;
      const signal = controller.signal;

      refetchFootprints();

      api.get('/api/notifications', { signal }).then((res) => {
        setNotifications(prev => {
          const apiIds = new Set(res.data.notifications.map(n => n._id));
          const socketOnly = prev.filter(n => !apiIds.has(n._id));
          return [...socketOnly, ...res.data.notifications];
        });
      }).catch(() => {});
    };

    const handleWake = () => {
      if (document.visibilityState !== 'visible') return;
      wakeSocket();
      refreshData();
    };

    document.addEventListener('visibilitychange', handleWake);
    return () => {
      document.removeEventListener('visibilitychange', handleWake);
      if (visibilityAbortRef.current) visibilityAbortRef.current.abort();
    };
  }, [user, footprintPeriod]);

  // ── Cross-tab auth sync (BroadcastChannel) ─────────────
  useEffect(() => {
    return listenAuthSync({
      currentUserId: user?._id,
      onForeignLogin: () => {
        if (!user?._id) return; // Already logged out
        clearAuth();
        window.location.reload();
      },
      onForeignLogout: () => {
        if (!user?._id) return; // Already logged out
        clearAuth();
        window.location.reload();
      },
    });
  }, [user?._id]);

  // ── Keep flyArrivedFp synced with latest footprints ────
  useEffect(() => {
    if (flyArrivedFp) {
      const latest = footprints.find((f) => f._id === flyArrivedFp._id);
      if (!latest) {
        setFlyArrivedFp(null); // footprint was deleted
      } else if (latest.comments !== flyArrivedFp.comments || latest.reactions !== flyArrivedFp.reactions) {
        setFlyArrivedFp(latest);
      }
    }
  }, [footprints, flyArrivedFp]);

  // ── Check for unread announcements ──────────────────────
  useEffect(() => {
    if (!user) { setAnnounceHasUnread(false); return; }
    let cancelled = false;
    api.get('/api/announcements').then(({ data }) => {
      if (!cancelled && data?.announcements) {
        setAnnounceHasUnread(hasUnreadAnnouncements(data.announcements));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  // ── Execute pending action after login ─────────────────
  useEffect(() => {
    if (user && pendingActionRef.current) {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      if (action.type === 'checkin') {
        openCheckIn();
      } else if (action.type === 'comment' || action.type === 'react') {
        setActiveFootprintId(action.footprintId);
      }
    }
  }, [user]);

  // ── Handlers ───────────────────────────────────────────

  const requireLogin = (action) => {
    if (!user) {
      pendingActionRef.current = action;
      setAuthMessage('登录后即可参与互动喔！');
      setAuthTab('login');
      openAuth();
      return false;
    }
    return true;
  };

  const handleReact = useCallback(async (footprintId, emoji) => {
    if (!requireLogin({ type: 'react', footprintId })) return;
    try {
      const { data } = await api.post(`/api/footprints/${footprintId}/react`, { emoji });
      setFootprints((prev) =>
        prev.map((fp) => (fp._id === footprintId ? { ...fp, reactions: data.footprint.reactions } : fp))
      );
    } catch (err) {
      console.error('React failed:', err);
    }
  }, [user]);

  const handleDelete = useCallback(async (footprintId) => {
    if (!requireLogin({ type: 'delete', footprintId })) return;
    if (!confirm('确认删除这条足迹？')) return;
    try {
      await api.delete(`/api/footprints/${footprintId}`);
      setFootprints((prev) => prev.filter((fp) => fp._id !== footprintId));
      setFlyArrivedFp((prev) => prev && prev._id === footprintId ? null : prev);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }, [user]);

  const handleDeleteComment = useCallback(async (footprintId, commentId) => {
    try {
      const { data } = await api.delete(`/api/footprints/${footprintId}/comments/${commentId}`);
      setFootprints((prev) =>
        prev.map((fp) => (fp._id === footprintId
          ? { ...fp, comments: data.footprint.comments }
          : fp))
      );
    } catch (err) {
      console.error('Delete comment failed:', err);
    }
  }, []);

  const handleShare = useCallback((footprintId) => {
    const url = `${window.location.origin}${window.location.pathname}?fp=${footprintId}`;
    navigator.clipboard.writeText(url).catch(() => {});
  }, []);

  const handleComment = useCallback(async (footprintId, content) => {
    if (!requireLogin({ type: 'comment', footprintId })) return;
    try {
      const { data } = await api.post(`/api/footprints/${footprintId}/comment`, { content });
      setFootprints((prev) =>
        prev.map((fp) => (fp._id === footprintId ? { ...fp, comments: data.footprint.comments } : fp))
      );
    } catch (err) {
      console.error('Comment failed:', err);
    }
  }, [user]);

  const markAsRead = useCallback(async (notifId) => {
    setUnreadCount((prev) => {
      const next = Math.max(0, prev - 1);
      try { localStorage.setItem(READ_COUNT_KEY, String(next)); } catch {}
      return next;
    });
    setNotifications((prev) =>
      prev.map((n) => (n._id === notifId ? { ...n, isRead: true } : n))
    );
    await api.put(`/api/notifications/${notifId}/read`).catch(() => {});
  }, []);

  // ── Event listeners ────────────────────────────────────

  useEffect(() => {
    const handler = (e) => {
      console.log('[App] cluster:click received, footprints:', e.detail?.footprints?.length);
      setClusterData(e.detail);
    };
    window.addEventListener('cluster:click', handler);
    return () => window.removeEventListener('cluster:click', handler);
  }, []);

  useEffect(() => {
    const handler = (e) => openProfile(e.detail.userId);
    window.addEventListener('profile:view', handler);
    return () => window.removeEventListener('profile:view', handler);
  }, []);

  const handleLogout = () => {
    const uid = user?._id;
    clearAuth();
    broadcastLogout(uid);
    setUser(null);
    setNotifications([]);
    refetchFootprints();
  };

  // ── Derived values ─────────────────────────────────────

  const clusterFootprints = useMemo(() => {
    if (!clusterData) return null;
    const ids = new Set(clusterData.footprints.map(f => f._id));
    return footprints.filter(f => ids.has(f._id));
  }, [clusterData, footprints]);

  const isAdmin = user?.role === 'admin';
  const isAsen = user?.name === '阿森';

  // Derived: friend info for ChatWindow (async fallback for non-friend admin chats)
  const [chatFriendMeta, setChatFriendMeta] = useState(null);
  useEffect(() => {
    if (!chatUserId) { setChatFriendMeta(null); return; }
    let cancelled = false;
    const existing = friends.find(f => f._id === chatUserId);
    if (existing) {
      setChatFriendMeta(existing);
    } else {
      api.get(`/api/users/${chatUserId}/profile`).then(res => {
        if (!cancelled && res?.data?.user) {
          setChatFriendMeta({ _id: chatUserId, name: res.data.user.name, avatarUrl: res.data.user.avatarUrl });
        }
      }).catch(() => {
        if (!cancelled) setChatFriendMeta({ _id: chatUserId, name: '用户', avatarUrl: null });
      });
    }
    return () => { cancelled = true; };
  }, [chatUserId, friends]);

  // Dynamic Island for new private messages (when chat window is not focused on sender)
  useEffect(() => {
    const handler = (e) => {
      const msg = e.detail;
      if (msg?.senderId && chatUserId !== msg.senderId) {
        setMessageIsland({
          type: 'message',
          senderId: msg.senderId,
          senderName: msg._senderName || '好友',
        });
      }
    };
    window.addEventListener('ws:new_message', handler);
    return () => window.removeEventListener('ws:new_message', handler);
  }, [chatUserId, setMessageIsland]);

  const totalFriendUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  // ── Render ─────────────────────────────────────────────

  return (
    <ErrorBoundary>
      <div className="fixed inset-0 overflow-hidden"
        style={{ background: 'var(--aurora-deep)', touchAction: 'none' }}>
        {/* ── Mobile top bar: Bliver (left) ‖ 公告 + 好友 + 菜单 (right) ── */}
        <div className="md:hidden fixed z-[1000] pointer-events-none inset-x-0 flex items-start justify-between transform-gpu will-change-transform"
          style={{ top: `max(14px, env(safe-area-inset-top))`, paddingLeft: `max(14px, env(safe-area-inset-left))`, paddingRight: `max(12px, env(safe-area-inset-right))` }}>

          {/* Left column */}
          <div className="pointer-events-auto flex flex-col items-start gap-2.5">
            <button
              type="button"
              onClick={() => openAbout()}
              className="px-3.5 py-2 rounded-xl
                bg-[#121212]/50 backdrop-blur-xl
                border border-white/10
                text-white text-sm font-bold shadow-lg
                active:scale-95 transition-transform duration-150"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Bliver
            </button>

            {user && (
              <button
                type="button"
                onClick={() => openAnnouncements()}
                className="relative w-8 h-8 rounded-lg flex items-center justify-center
                  bg-[#121212]/50 backdrop-blur-xl
                  border border-white/[0.08]
                  shadow-lg active:scale-90 transition-all duration-150"
              >
                <Megaphone className="w-3.5 h-3.5 text-white/50" />
                {announceHasUnread && (
                  <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-400
                    shadow-[0_0_6px_rgba(251,191,36,0.5)]" />
                )}
              </button>
            )}
          </div>

          {/* Right: handled by MobileActionDrawer (unchanged) */}
        </div>

        <NavBar
          onlineCount={onlineCount}
          user={user}
          onLogout={handleLogout}
          unreadCount={unreadCount}
          announceHasUnread={announceHasUnread}
          friendUnreadCount={totalFriendUnread}
          isAdmin={isAdmin}
          onCheckIn={() => {
            if (!requireLogin({ type: 'checkin' })) return;
            openCheckIn();
          }}
        />

        {showNotifs && (
          <NotificationPanel
            notifications={notifications}
            onClose={() => closeNotifs()}
            onMarkRead={markAsRead}
          />
        )}

        {showAnnouncements && (
          <AnnouncementPanel
            isOpen={showAnnouncements}
            onClose={() => { closeAnnouncements(); setAnnounceHasUnread(false); }}
            isAsen={user?.name === '阿森'}
            onToast={(msg) => useUIStore.getState().addNotification({ type: 'announcement', content: msg })}
          />
        )}

        {showFriends && (
          <FriendsPanel
            isOpen={showFriends}
            onClose={() => closeFriends()}
            friends={friends}
            onlineStatus={onlineStatus}
            unreadCounts={unreadCounts}
            onOpenProfile={(uid) => { closeFriends(); openProfile(uid); }}
            onOpenChat={(uid) => { closeFriends(); openChat(uid); }}
          />
        )}

        {chatUserId && chatFriendMeta && (
          <ChatWindow
            chatUserId={chatUserId}
            friendName={chatFriendMeta.name}
            friendAvatar={chatFriendMeta.avatarUrl}
            isOnline={onlineStatus[chatUserId] || false}
            user={user}
            socketRef={socketRef}
            onOpen={() => { useUIStore.getState().dismissByType('message'); clearMessageIsland(); clearUnread(chatUserId); }}
            onClose={() => { clearUnread(chatUserId); closeChat(); }}
            onToast={(msg) => useUIStore.getState().addNotification({ type: 'message', content: msg })}
          />
        )}

        <MapContainer key="map" center={CENTER} zoom={6} scrollWheelZoom zoomControl={false}
          className="w-full h-full"
          style={{ zIndex: 0 }}>
          <MapResizeHandler />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            crossOrigin=""
          />
          <RecenterOnLoad footprints={footprints} targetId={shareTarget} />
          <FlyToFootprint
            footprints={footprints}
            activeFootprintId={activeFootprintId}
            onArrive={(fp) => setFlyArrivedFp(fp)}
          />
          <PanToTarget
            targetId={timelineTargetFpId}
            footprints={footprints}
            onArrive={(fp) => {
              setTimelineTargetFpId(null);
              setFlyArrivedFp(fp);
            }}
          />
          <ClusterMarkers
            footprints={footprints}
            userId={user?._id}
            isAdmin={isAdmin}
          />
        </MapContainer>

        {/* Desktop side buttons */}
        <div className="hidden md:flex absolute z-[1000] flex-col gap-2 transform-gpu will-change-transform"
          style={{ top: `max(88px, calc(env(safe-area-inset-top) + 64px))`, right: `max(12px, env(safe-area-inset-right))` }}>
          <button
            onClick={() => openTimeline()}
            className="aurora-btn-glass px-4 py-2.5 rounded-2xl text-sm font-medium flex items-center gap-2"
          >
            <Clock className="w-4 h-4 text-teal-400" />
            <span className="text-white/80">足迹记录</span>
          </button>
          <button
            onClick={() => openPhotoWall()}
            className="aurora-btn-glass px-4 py-2.5 rounded-2xl text-sm font-medium flex items-center gap-2"
          >
            <Image className="w-4 h-4 text-purple-400" />
            <span className="text-white/80">照片墙</span>
          </button>
        </div>

        <CheckInModal isOpen={showCheckIn} onClose={closeCheckIn} />

        <TimelineDrawer
          isOpen={showTimeline}
          onClose={() => closeTimeline()}
          footprints={footprints}
          userId={user?._id}
          isAdmin={isAdmin}
          onReact={handleReact}
          onDelete={handleDelete}
          onShare={handleShare}
          onSelectFootprint={(fpId) => { closeTimeline(); setTimelineTargetFpId(fpId); }}
          period={footprintPeriod}
          onChangePeriod={setFootprintPeriod}
          loading={footprintsLoading}
        />

        <MobileActionDrawer
          user={user}
          isAdmin={isAdmin}
          unreadCount={unreadCount}
          friendUnreadCount={totalFriendUnread}
          onCheckIn={() => {
            if (!requireLogin({ type: 'checkin' })) return;
            openCheckIn();
          }}
        />

        <AnimatePresence>
          {flyArrivedFp && (
            <FootprintDetailModal
              key={flyArrivedFp._id}
              fp={flyArrivedFp}
              allFootprints={footprints}
              userId={user?._id}
              isAdmin={isAdmin}
              onReact={handleReact}
              onDelete={handleDelete}
              onShare={handleShare}
              onComment={handleComment}
              onDeleteComment={handleDeleteComment}
              onClose={() => { setFlyArrivedFp(null); setActiveFootprintId(null); }}
            />
          )}
        </AnimatePresence>

        {clusterFootprints && (
          <ErrorBoundary>
            <ClusterDetailPanel
              footprints={clusterFootprints}
              userId={user?._id}
              isAdmin={isAdmin}
              onReact={handleReact}
              onDelete={handleDelete}
              onShare={handleShare}
              onComment={handleComment}
              onDeleteComment={handleDeleteComment}
              onClose={() => { setClusterData(null); setActiveFootprintId(null); }}
            />
          </ErrorBoundary>
        )}

        {showAdmin && <ErrorBoundary><AdminPanel onClose={() => closeAdmin()} /></ErrorBoundary>}

        {showPhotoWall && (
          <PhotoWall
            footprints={footprints}
            onClose={() => closePhotoWall()}
            onSelect={(fpId) => { closePhotoWall(); setTimelineTargetFpId(fpId); }}
          />
        )}

        <AboutModal isOpen={showAbout} onClose={() => closeAbout()} user={user} />

        {showAuth && (
          <AuthModal
            initialTab={authTab}
            message={authMessage}
            onDone={(u) => { setUser(u); closeAuth(); setTimeout(() => broadcastLogin(u), 0); subscribeToPush().catch(() => {}); }}
            onClose={() => closeAuth()}
          />
        )}

        <AnimatePresence>
          {viewingProfileId && (
            <ErrorBoundary key={viewingProfileId}>
              <ProfileDrawer
                userId={viewingProfileId}
                onClose={() => closeProfile()}
                onLogout={() => { closeProfile(); handleLogout(); }}
                onSelectFootprint={(fpId) => { closeProfile(); setActiveFootprintId(fpId); }}
                friendshipStatus={friendshipStatus}
                pendingRequestId={getPendingRequestId(viewingProfileId)}
                onSendFriendRequest={sendFriendRequest}
                onAcceptRequest={acceptRequest}
                onRejectRequest={rejectRequest}
                onOpenChat={(uid) => { closeProfile(); openChat(uid); }}
              />
            </ErrorBoundary>
          )}
        </AnimatePresence>

        <MessageIsland
          type={messageIsland?.type}
          senderName={messageIsland?.senderName}
          footprintId={messageIsland?.footprintId}
          senderId={messageIsland?.senderId}
          onView={() => {
            const island = messageIsland;
            clearMessageIsland();
            if (island?.type === 'message' && island?.senderId) {
              openChat(island.senderId);
            } else if (island?.footprintId) {
              setActiveFootprintId(island.footprintId);
            }
          }}
          onDismiss={clearMessageIsland}
        />

        <GlobalToaster />

        <style>{`
          @keyframes slideDown {
            from { opacity: 0; transform: translate(-50%, -12px); }
            to { opacity: 1; transform: translate(-50%, 0); }
          }
          .animate-slide-down { animation: slideDown 0.4s cubic-bezier(0.2,0.8,0.2,1); }
        `}</style>
      </div>
    </ErrorBoundary>
  );
}
