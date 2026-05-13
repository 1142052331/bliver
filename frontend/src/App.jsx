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
import { broadcastLogin } from './authSync';
import useAuth from './hooks/useAuth';
import { refetchNotifications } from './hooks/useNotifications';
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
import AnnouncementPanel from './components/AnnouncementPanel';
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
import useAnnounceUnread from './hooks/useAnnounceUnread';
import useVisibilityRefresh from './hooks/useVisibilityRefresh';
import useChatFriendMeta from './hooks/useChatFriendMeta';
import { subscribeToPush } from './push';


delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export default function App() {
  // ── Proactive permissions (location + notification) on launch ──
  const permRequested = useRef(false);
  useEffect(() => {
    if (permRequested.current) return;
    permRequested.current = true;

    // Location permission: trigger native dialog proactively
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => { console.log('[Perm] Location granted'); },
        (err) => { console.log('[Perm] Location:', err.code === 1 ? 'denied' : err.message); },
        { timeout: 8000, enableHighAccuracy: false, maximumAge: 300_000 },
      );
    }

    // Notification permission: trigger dialog if undecided
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then((p) => console.log('[Perm] Notification:', p));
    }
  }, []);

  // ── Auth ───────────────────────────────────────────────
  const { user, setUser, isAdmin, isAsen, requireLogin, logout, pendingActionRef } = useAuth();

  // ── Notifications ─────────────────────────────────────
  const { notifications, setNotifications, unreadCount, markFootprintRead, handleNotifNavigate } = useNotifications();

  // ── Core state ────────────────────────────────────────
  const [onlineCount, setOnlineCount] = useState(0);
  const [announceHasUnread, clearAnnounceUnread] = useAnnounceUnread(user);
  const [footprintPeriod, setFootprintPeriod] = useState('week');

  // ── React Query: footprints ────────────────────────────
  const queryClient = useQueryClient();
  const periodRef = useRef(footprintPeriod);
  periodRef.current = footprintPeriod;
  const { data: footprints = [], isLoading: footprintsLoading, refetch: refetchFootprints } = useFootprints(footprintPeriod, null);

  // Stable cache updater for socket/mutations (uses refs to avoid stale closures)
  const setFootprints = useCallback((updater) => {
    queryClient.setQueryData(['footprints', periodRef.current, null], (old) => {
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
  useVisibilityRefresh({ user, socketRef, refetchFootprints, setNotifications });

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

  // ── Footprint actions ──────────────────────────────────

  const { handleReact, handleDelete, handleDeleteComment, handleShare, handleComment } =
    useFootprintActions({ user, requireLogin, setFootprints });

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
  const chatFriendMeta = useChatFriendMeta(chatUserId, friends);

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
              onClose={() => { closeAnnouncements(); clearAnnounceUnread(); }}
              isAsen={isAsen}
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
