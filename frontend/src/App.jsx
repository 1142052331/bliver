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
import { getPeriod, setPeriod } from './auth';
import useAuth from './hooks/useAuth';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { Image, Clock } from 'lucide-react';

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
import FeedbackModal from './components/FeedbackModal';
import ProfileDrawer from './components/ProfileDrawer';
import FootprintDetailModal from './components/FootprintDetailModal';
import ErrorBoundary from './components/ErrorBoundary';
import PhotoWall from './components/PhotoWall';
import AnnouncementPanel from './components/AnnouncementPanel';
import FriendsPanel from './components/FriendsPanel';
import ChatWindow from './components/ChatWindow';
import MessageIsland from './components/MessageIsland';
import AppShell from './components/shell/AppShell';
import MobileTopBar from './components/shell/MobileTopBar';
import BottomNavigation from './components/shell/BottomNavigation';
import CheckInAction from './components/shell/CheckInAction';
import LegacyDestinationBridge from './components/shell/LegacyDestinationBridge';
import useUIStore from './store/useUIStore';
import useShellStore from './store/useShellStore';
import useSocket from './hooks/useSocket';
import useFriends from './hooks/useFriends';
import { FootprintActionsProvider } from './contexts/FootprintActionsContext';
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

    // Notification permission: always try to request (even if previously denied)
    // Capacitor WebView may re-show native dialog; browsers won't but no harm in trying
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission().then((p) => console.log('[Perm] Notification:', p));
    }
  }, []);

  // ── Auth ───────────────────────────────────────────────
  const { user, setUser, isAdmin, isAsen, requireLogin, logout, pendingActionRef } = useAuth();

  // ── Notifications ─────────────────────────────────────
  const {
    notifications,
    setNotifications,
    appendNotification,
    applyServerNotifications,
    captureNotificationRequest,
    clearNotifications,
    unreadCount,
    markFootprintRead,
    handleNotifNavigate,
  } = useNotifications(user?._id);

  // ── Core state ────────────────────────────────────────
  const [onlineCount, setOnlineCount] = useState(0);
  const [announceHasUnread, clearAnnounceUnread] = useAnnounceUnread(user);
  const [footprintPeriod, setFootprintPeriod] = useState(getPeriod);
  const handlePeriodChange = useCallback((p) => { setPeriod(p); setFootprintPeriod(p); }, []);

  // ── React Query: footprints ────────────────────────────
  const queryClient = useQueryClient();
  const periodRef = useRef(footprintPeriod);
  periodRef.current = footprintPeriod;
  const { data: footprints = [], isLoading: footprintsLoading, refetch: refetchFootprints } = useFootprints(footprintPeriod, null);

  // ── Feedback trigger for returning users ───────────────
  const feedbackChecked = useRef(false);
  useEffect(() => {
    if (user && footprints.length > 0 && !feedbackChecked.current && !localStorage.getItem('feedback_submitted')) {
      feedbackChecked.current = true;
      setTimeout(() => openFeedback(), 800);
    }
  }, [user, footprints]);

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
    showPhotoWall, showAbout, showFeedback, showAnnouncements, showFriends,
    chatUserId, viewingProfileId,
    authTab, authMessage,
    shareTarget, clusterData, activeFootprintId, flyArrivedFp, timelineTargetFpId,
    openCheckIn, closeCheckIn, openTimeline, closeTimeline,
    toggleNotifs, closeNotifs, openAdmin, closeAdmin,
    openAuth, closeAuth, openPhotoWall, closePhotoWall,
    openAbout, closeAbout, openFeedback, closeFeedback, openAnnouncements, closeAnnouncements,
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
    user,
    setUser,
    setFootprints,
    setNotifications,
    appendNotification,
    applyServerNotifications,
    captureNotificationRequest,
    setOnlineCount,
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
  useVisibilityRefresh({
    user,
    socketRef,
    refetchFootprints,
    applyServerNotifications,
    captureNotificationRequest,
  });

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

  // ── Footprint actions are provided by FootprintActionsProvider below ──

  const handleLogout = () => {
    logout();
    clearNotifications();
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
  const activeDestination = useShellStore((state) => state.activeDestination);
  const setActiveDestination = useShellStore((state) => state.setActiveDestination);
  const destinationSurfaceBehindAuthIsOpen = (
    (activeDestination === 'activity' && showTimeline)
    || (activeDestination === 'messages' && showFriends)
    || (activeDestination === 'me' && Boolean(viewingProfileId))
  );
  const bottomNavigationLayer = destinationSurfaceBehindAuthIsOpen
    ? 'destination'
    : showAuth && activeDestination !== 'map'
      ? 'destination-auth'
      : 'base';

  const handleDestinationChange = (nextDestination) => {
    if (nextDestination === activeDestination) return;

    if (showTimeline) closeTimeline();
    if (showFriends) closeFriends();
    if (viewingProfileId) closeProfile();
    if (showAuth) closeAuth();

    setActiveDestination(nextDestination);
  };

  const handleCheckIn = () => {
    if (!requireLogin({ type: 'checkin' })) return;
    setPendingCheckInLocation(null);
    openCheckIn();
  };

  const handleNotificationsPress = () => {
    if (!user) {
      openAuth('login', '登录后查看通知');
      return;
    }
    toggleNotifs();
  };

  // ── Render ─────────────────────────────────────────────

  return (
    <ErrorBoundary>
      <AppShell
        topBar={
          <MobileTopBar
            locationLabel="地图"
            unreadNotifications={user ? unreadCount : 0}
            onBrandPress={openAbout}
            onNotificationsPress={handleNotificationsPress}
          />
        }
        bottomNavigation={
          <BottomNavigation
            activeDestination={activeDestination}
            layer={bottomNavigationLayer}
            unreadMessages={totalFriendUnread}
            onDestinationChange={handleDestinationChange}
          />
        }
        primaryAction={<CheckInAction onPress={handleCheckIn} />}
      >
        <div className="ios-app-shell ios-map-overlay absolute inset-0">
          <div className="hidden md:block">
            <NavBar
              onlineCount={onlineCount}
              user={user}
              onLogout={handleLogout}
              unreadCount={unreadCount}
              announceHasUnread={announceHasUnread}
              friendUnreadCount={totalFriendUnread}
              isAdmin={isAdmin}
              onCheckIn={handleCheckIn}
            />
          </div>

        {user && showNotifs && (
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
              onClose={() => { closeFriends(); setActiveDestination('map'); }}
              friends={friends}
              onlineStatus={onlineStatus}
              unreadCounts={unreadCounts}
              onOpenProfile={(uid) => { closeFriends(); setActiveDestination('map'); openProfile(uid); }}
              onOpenChat={(uid) => { closeFriends(); setActiveDestination('map'); openChat(uid); }}
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
        <div className="hidden md:flex absolute z-[1000] flex-col gap-2.5 transform-gpu will-change-transform"
          style={{ top: `max(88px, calc(env(safe-area-inset-top) + 64px))`, right: `max(12px, env(safe-area-inset-right))` }}>
          <button
            onClick={() => openTimeline()}
            className="aurora-btn-glass px-4 py-2.5 rounded-full text-sm font-semibold flex items-center gap-2"
          >
            <Clock className="w-4 h-4 text-teal-400" />
            <span className="text-white/80">足迹记录</span>
          </button>
          <button
            onClick={() => openPhotoWall()}
            className="aurora-btn-glass px-4 py-2.5 rounded-full text-sm font-semibold flex items-center gap-2"
          >
            <Image className="w-4 h-4 text-purple-400" />
            <span className="text-white/80">照片墙</span>
          </button>
        </div>


        <CheckInModal
          isOpen={showCheckIn}
          onClose={() => { closeCheckIn(); setPendingCheckInLocation(null); }}
          presetLocation={pendingCheckInLocation}
        />

        <FootprintActionsProvider user={user} requireLogin={requireLogin} setFootprints={setFootprints}>
          <TimelineDrawer
            isOpen={showTimeline}
            onClose={() => { closeTimeline(); setActiveDestination('map'); }}
            footprints={footprints}
            userId={user?._id}
            isAdmin={isAdmin}
            onSelectFootprint={(fpId) => { closeTimeline(); setActiveDestination('map'); setTimelineTargetFpId(fpId); }}
            period={footprintPeriod}
            onChangePeriod={handlePeriodChange}
            loading={footprintsLoading}
          />

          <AnimatePresence>
            {flyArrivedFp && (
              <FootprintDetailModal
                key={flyArrivedFp._id}
                fp={flyArrivedFp}
                allFootprints={footprints}
                userId={user?._id}
                isAdmin={isAdmin}
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
                onClose={() => { setClusterData(null); setActiveFootprintId(null); }}
              />
            </ErrorBoundary>
          )}
        </FootprintActionsProvider>

        <LegacyDestinationBridge
          destination={activeDestination}
          user={user}
          openTimeline={openTimeline}
          openFriends={openFriends}
          openProfile={openProfile}
          openAuth={openAuth}
        />

        {showAdmin && <ErrorBoundary><AdminPanel onClose={() => closeAdmin()} socketRef={socketRef} /></ErrorBoundary>}

        {showPhotoWall && (
          <PhotoWall
            footprints={footprints}
            onClose={() => closePhotoWall()}
            onSelect={(fpId) => { closePhotoWall(); setTimelineTargetFpId(fpId); }}
          />
        )}

        <AboutModal isOpen={showAbout} onClose={() => closeAbout()} user={user} />
        <FeedbackModal isOpen={showFeedback} onClose={closeFeedback} />

        {showAuth && (
          <AuthModal
            initialTab={authTab}
            message={authMessage}
            onDone={(u) => { setUser(u); closeAuth(); if (!destinationSurfaceBehindAuthIsOpen) setActiveDestination('map'); setTimeout(() => broadcastLogin(u), 0); subscribeToPush().catch(() => {}); }}
            onClose={() => { closeAuth(); if (!destinationSurfaceBehindAuthIsOpen) setActiveDestination('map'); }}
          />
        )}

        <AnimatePresence>
          {viewingProfileId && (
            <ErrorBoundary key={viewingProfileId}>
              <ProfileDrawer
                userId={viewingProfileId}
                onClose={() => { closeProfile(); setActiveDestination('map'); }}
                onLogout={() => { closeProfile(); setActiveDestination('map'); handleLogout(); }}
                onSelectFootprint={(fpId) => { closeProfile(); setActiveDestination('map'); setActiveFootprintId(fpId); }}
                friendshipStatus={friendshipStatus}
                pendingRequestId={getPendingRequestId(viewingProfileId)}
                onSendFriendRequest={sendFriendRequest}
                onAcceptRequest={acceptRequest}
                onRejectRequest={rejectRequest}
                onOpenChat={(uid) => { closeProfile(); setActiveDestination('map'); openChat(uid); }}
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
      </AppShell>
    </ErrorBoundary>
  );
}
