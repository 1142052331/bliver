import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    environment: import.meta.env.MODE,
  });
}
import api from './api';
import useAuth from './hooks/useAuth';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { MapPin, Image, Clock, Megaphone } from 'lucide-react';

import NavBar from './components/NavBar';
import AuthModal from './components/AuthModal';
import CheckInModal from './components/CheckInModal';
import TimelineDrawer from './components/TimelineDrawer';
import MapView from './components/MapView';
import ClusterDetailPanel from './components/ClusterDetailPanel';
import NotificationPanel from './components/NotificationPanel';
import AdminPanel from './components/AdminPanel';
import GlobalToaster from './components/GlobalToaster';
import AboutModal from './components/AboutModal';
import ProfileDrawer from './components/ProfileDrawer';
import FootprintDetailModal from './components/FootprintDetailModal';
import ErrorBoundary from './components/ErrorBoundary';
import PhotoWall from './components/PhotoWall';
import AnnouncementPanel, { hasUnreadAnnouncements } from './components/AnnouncementPanel';
import FriendsPanel from './components/FriendsPanel';
import ChatWindow from './components/ChatWindow';
import MessageIsland from './components/MessageIsland';
import MobileActionDrawer from './components/MobileActionDrawer';
import useUIStore from './store/useUIStore';
import useSocket from './hooks/useSocket';
import useFriends from './hooks/useFriends';
import useFootprintActions from './hooks/useFootprintActions';
import useFootprints from './hooks/useFootprints';
import useNotifications from './hooks/useNotifications';
import { subscribeToPush } from './push';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export default function App() {
  // ── Auth ───────────────────────────────────────────────
  const { user, setUser, isAdmin, isAsen, requireLogin, logout, pendingActionRef } = useAuth();

  // ── Notifications ─────────────────────────────────────
  const { notifications, setNotifications, unreadCount, markFootprintRead, handleNotifNavigate } = useNotifications();

  // ── Core state ────────────────────────────────────────
  const [onlineCount, setOnlineCount] = useState(0);
  const [announceHasUnread, setAnnounceHasUnread] = useState(false);
  const [footprintPeriod, setFootprintPeriod] = useState('week');

  // ── React Query: footprints ────────────────────────────
  const queryClient = useQueryClient();
  const periodRef = useRef(footprintPeriod);
  periodRef.current = footprintPeriod;
  const ghostUserId = useUIStore((s) => s.ghostMode?.userId) || null;
  const ghostUserIdRef = useRef(ghostUserId);
  ghostUserIdRef.current = ghostUserId;
  const { data: footprints = [], isLoading: footprintsLoading, refetch: refetchFootprints } = useFootprints(footprintPeriod, ghostUserId);

  // Stable cache updater for socket/mutations (uses refs to avoid stale closures)
  const setFootprints = useCallback((updater) => {
    queryClient.setQueryData(['footprints', periodRef.current, ghostUserIdRef.current], (old) => {
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
    ghostMode, enterGhostMode, exitGhostMode,
    pendingCheckInLocation, setPendingCheckInLocation,
  } = useUIStore();

  // ── Refs ──────────────────────────────────────────────
  const { socketRef } = useSocket({
    user, setUser, setFootprints, setNotifications, setOnlineCount,
  });

  const {
    friends, onlineStatus, unreadCounts, pendingRequests,
    friendshipStatus, getPendingRequestId,
    sendFriendRequest, acceptRequest, rejectRequest, clearUnread,
  } = useFriends({ user, socketRef });

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

  // ── Footprint actions ──────────────────────────────────

  const { handleReact, handleDelete, handleDeleteComment, handleShare, handleComment } =
    useFootprintActions({ user, requireLogin, setFootprints });

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
    logout();
    setNotifications([]);
    refetchFootprints();
  };

  // ── Derived values ─────────────────────────────────────

  const clusterFootprints = useMemo(() => {
    if (!clusterData) return null;
    const ids = new Set(clusterData.footprints.map(f => f._id));
    return footprints.filter(f => ids.has(f._id));
  }, [clusterData, footprints]);

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
                className="relative w-11 h-11 rounded-lg flex items-center justify-center
                  bg-[#121212]/50 backdrop-blur-xl
                  border border-white/[0.08]
                  shadow-lg active:scale-90 transition-all duration-150"
              >
                <Megaphone className="w-4 h-4 text-white/50" />
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

        {/* Ghost Mode Banner */}
        {ghostMode && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 z-[1100] mt-2 px-4 py-2 bg-amber-500/90 backdrop-blur border border-amber-400/50 rounded-full shadow-2xl flex items-center gap-3">
            <span className="text-sm font-bold text-gray-900">
              👁️ 正在以 <span className="underline">{ghostMode.userName}</span> 的视角浏览
            </span>
            <button
              onClick={exitGhostMode}
              className="text-xs font-bold text-gray-900/70 hover:text-gray-900 bg-gray-900/10 hover:bg-gray-900/20 px-2 py-0.5 rounded-full transition-colors"
            >
              退出幻影模式
            </button>
          </div>
        )}

        {showNotifs && (
          <NotificationPanel
            notifications={notifications}
            onClose={() => closeNotifs()}
            onNavigate={handleNotifNavigate}
          />
        )}

        <AnimatePresence>
          {showAnnouncements && (
            <AnnouncementPanel
              key="announcements"
              isOpen={showAnnouncements}
              onClose={() => { closeAnnouncements(); setAnnounceHasUnread(false); }}
              isAsen={user?.name === '阿森'}
              onToast={(msg) => useUIStore.getState().addToast({ type: 'announcement', content: msg })}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showFriends && (
            <FriendsPanel
              key="friends"
              isOpen={showFriends}
              onClose={() => closeFriends()}
              friends={friends}
              onlineStatus={onlineStatus}
              unreadCounts={unreadCounts}
              onOpenProfile={(uid) => { closeFriends(); openProfile(uid); }}
              onOpenChat={(uid) => { closeFriends(); openChat(uid); }}
            />
          )}
        </AnimatePresence>

        {chatUserId && chatFriendMeta && (
          <ChatWindow
            chatUserId={chatUserId}
            friendName={chatFriendMeta.name}
            friendAvatar={chatFriendMeta.avatarUrl}
            isOnline={onlineStatus[chatUserId] || false}
            user={user}
            socketRef={socketRef}
            onOpen={() => { useUIStore.getState().dismissToastByType('message'); clearMessageIsland(); clearUnread(chatUserId); }}
            onClose={() => { clearUnread(chatUserId); closeChat(); }}
            onToast={(msg) => useUIStore.getState().addToast({ type: 'message', content: msg })}
          />
        )}

        <MapView
          footprints={footprints}
          shareTarget={shareTarget}
          activeFootprintId={activeFootprintId}
          timelineTargetFpId={timelineTargetFpId}
          user={user}
          isAdmin={isAdmin}
          setFlyArrivedFp={setFlyArrivedFp}
          setTimelineTargetFpId={setTimelineTargetFpId}
        />

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

        {/* Mobile check-in FAB — iOS glass style, bottom center */}
        <div className="md:hidden fixed z-[1000] pointer-events-none transform-gpu will-change-transform"
          style={{
            bottom: `max(20px, env(safe-area-inset-bottom))`,
            left: '50%',
            transform: 'translateX(-50%)',
          }}>
          <button
            onClick={() => {
              if (!requireLogin({ type: 'checkin' })) return;
              setPendingCheckInLocation(null);
              openCheckIn();
            }}
            className="pointer-events-auto flex items-center gap-2 px-5 py-3 rounded-full
              bg-[#121212]/60 backdrop-blur-xl
              border border-white/[0.08]
              shadow-lg shadow-black/20
              active:scale-95 transition-all duration-200"
          >
            <MapPin className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-white/80">打卡</span>
          </button>
        </div>

        <CheckInModal
          isOpen={showCheckIn}
          onClose={() => { closeCheckIn(); setPendingCheckInLocation(null); }}
          presetLocation={pendingCheckInLocation}
        />

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

        {showAdmin && <ErrorBoundary><AdminPanel onClose={() => closeAdmin()} socketRef={socketRef} /></ErrorBoundary>}

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
            // Mark related backend notifications as read
            if (island?.footprintId) {
              markFootprintRead(island.footprintId);
            }
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
