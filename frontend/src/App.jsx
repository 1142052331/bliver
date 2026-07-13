import { lazy, Suspense, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    environment: import.meta.env.VITE_DEPLOY_ENV || import.meta.env.MODE,
    ...(import.meta.env.VITE_RELEASE_SHA ? { release: import.meta.env.VITE_RELEASE_SHA } : {}),
  });
}
if (typeof window !== 'undefined') window.__bliverSentry = Sentry;
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
import NotificationPanel from './components/NotificationPanel';
const AdminPanel = lazy(() => import('./components/AdminPanel'));
import GlobalToaster from './components/GlobalToaster';
import AboutModal from './components/AboutModal';
import FeedbackModal from './components/FeedbackModal';
import ProfileDrawer from './components/ProfileDrawer';
import MeExperience from './components/MeExperience';
import FootprintDetailModal from './components/FootprintDetailModal';
import ErrorBoundary from './components/ErrorBoundary';
const PhotoWall = lazy(() => import('./components/PhotoWall'));
const AnnouncementPanel = lazy(() => import('./components/AnnouncementPanel'));
import FriendsPanel from './components/FriendsPanel';
import ChatWindow from './components/ChatWindow';
import MessageIsland from './components/MessageIsland';
import AppShell from './components/shell/AppShell';
import MobileTopBar from './components/shell/MobileTopBar';
import BottomNavigation from './components/shell/BottomNavigation';
import CheckInAction from './components/shell/CheckInAction';
import LegacyDestinationBridge from './components/shell/LegacyDestinationBridge';
import LegacySurfaceFallback from './components/shell/LegacySurfaceFallback';
import MapPreviewCard from './components/MapPreviewCard';
import SamePlaceSheet from './components/map/SamePlaceSheet';
import ActivityPage from './components/activity/ActivityPage';
import useUIStore from './store/useUIStore';
import useShellStore from './store/useShellStore';
import useSocket from './hooks/useSocket';
import useFriends from './hooks/useFriends';
import { FootprintActionsProvider } from './contexts/FootprintActionsContext';
import useMapFootprints from './hooks/useMapFootprints';
import useLocationContext from './hooks/useLocationContext';
import useLegacyReadImport from './hooks/useLegacyReadImport';
import useNotifications from './hooks/useNotifications';
import useAnnounceUnread from './hooks/useAnnounceUnread';
import useVisibilityRefresh from './hooks/useVisibilityRefresh';
import useChatFriendMeta from './hooks/useChatFriendMeta';
import { subscribeToPush } from './push';
import {
  DEFAULT_MAP_QUERY,
  mergeCanonicalMapParams,
  parseMapQuery,
} from './domain/mapQuery';


delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const EMPTY_FOOTPRINTS = [];

export default function App() {
  // ── Auth ───────────────────────────────────────────────
  const {
    user,
    setUser,
    isAdmin,
    isAsen,
    requireLogin,
    logout,
    pendingActionRef,
    restoredAction,
    consumePendingAction,
  } = useAuth();

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
  const locationContext = useLocationContext();
  const [mapQuery, setMapQuery] = useState(() => {
    const parsed = parseMapQuery(
      new URLSearchParams(window.location.search),
      { isAuthenticated: Boolean(user) },
    );
    const fixed = locationContext.scopeContext;
    if (parsed.scope !== 'smart' || fixed.reason !== 'fixed') return parsed;
    return {
      ...parsed,
      scope: fixed.scope,
      ...(fixed.countryCode ? { countryCode: fixed.countryCode } : {}),
      ...(fixed.regionCode ? { regionCode: fixed.regionCode } : {}),
    };
  });
  useLegacyReadImport(user?._id);
  const effectiveMapQuery = useMemo(() => {
    if (mapQuery.scope !== 'smart') return mapQuery;
    const context = locationContext.scopeContext;
    if (context.scope === 'global') return { ...mapQuery, scope: 'global' };
    if (context.scope === 'region' || context.scope === 'country') {
      return {
        ...mapQuery,
        scope: context.scope,
        ...(context.countryCode ? { countryCode: context.countryCode } : {}),
        ...(context.regionCode ? { regionCode: context.regionCode } : {}),
      };
    }
    return {
      ...mapQuery,
      ...(context.countryCode ? { countryCode: context.countryCode } : {}),
      ...(context.regionCode ? { regionCode: context.regionCode } : {}),
    };
  }, [locationContext.scopeContext, mapQuery]);
  const viewerKey = user?._id || 'guest';
  const mapFootprintsQuery = useMapFootprints(effectiveMapQuery, viewerKey);
  const footprints = mapFootprintsQuery.data?.footprints || EMPTY_FOOTPRINTS;
  const footprintsLoading = mapFootprintsQuery.isLoading;
  const footprintsError = mapFootprintsQuery.error;
  const refetchFootprints = mapFootprintsQuery.refetch;

  const handleMapQueryChange = useCallback((nextQuery) => {
    setMapQuery(nextQuery);
  }, []);

  useEffect(() => {
    if (!user && mapQuery.content === 'unread') {
      setMapQuery((current) => ({ ...current, content: 'all' }));
    }
  }, [mapQuery.content, user]);

  useEffect(() => {
    const params = mergeCanonicalMapParams(new URLSearchParams(window.location.search), mapQuery);
    const search = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
    );
  }, [mapQuery]);

  // ── Feedback trigger for returning users ───────────────
  const openFeedback = useUIStore((state) => state.openFeedback);
  const feedbackChecked = useRef(false);
  useEffect(() => {
    if (user && footprints.length > 0 && !feedbackChecked.current && !localStorage.getItem('feedback_submitted')) {
      feedbackChecked.current = true;
      setTimeout(() => openFeedback(), 800);
    }
  }, [footprints, openFeedback, user]);

  // Stable cache updater for footprint mutations.
  const setFootprints = useCallback((updater) => {
    queryClient.setQueriesData({ queryKey: ['footprints', 'map'] }, (old) => {
      if (!old) return old;
      const next = typeof updater === 'function'
        ? updater(old.footprints || [])
        : updater;
      return { ...old, footprints: next };
    });
  }, [queryClient]);

  // ── UI state (Zustand) ────────────────────────────────
  const {
    showCheckIn, showTimeline, showNotifs, showAdmin, showAuth,
    showPhotoWall, showAbout, showFeedback, showAnnouncements, showFriends,
    chatUserId, viewingProfileId,
    authTab, authMessage,
    shareTarget, samePlaceIds, activeFootprintId, mapPreviewId, flyArrivedFp, timelineTargetFpId,
    footprintEvent, footprintEventId,
    openCheckIn, closeCheckIn, openTimeline, closeTimeline,
    toggleNotifs, closeNotifs, closeAdmin,
    openAuth, closeAuth, openPhotoWall, closePhotoWall,
    openAbout, closeAbout, closeFeedback, closeAnnouncements,
    openFriends, closeFriends,
    setActiveFootprintId, setMapPreviewId, setFlyArrivedFp, setTimelineTargetFpId,
    closeSamePlace, setShareTarget,
    openChat, closeChat, openProfile, closeProfile,
    messageIsland, clearMessageIsland,
    pendingCheckInLocation, setPendingCheckInLocation,
  } = useUIStore();
  const [pulseIds, setPulseIds] = useState(() => new Set());
  const [activityDetailFp, setActivityDetailFp] = useState(null);
  const activityPendingTargetRef = useRef(null);

  const addPulseId = useCallback((footprintId) => {
    if (!footprintId) return;
    setPulseIds((current) => {
      if (current.has(footprintId)) return current;
      const next = new Set(current);
      next.add(footprintId);
      return next;
    });
  }, []);

  const handlePulseComplete = useCallback((footprintId) => {
    setPulseIds((current) => {
      if (!current.has(footprintId)) return current;
      const next = new Set(current);
      next.delete(footprintId);
      return next;
    });
  }, []);

  // ── Refs ──────────────────────────────────────────────
  const { socketRef } = useSocket({
    user,
    setUser,
    setNotifications,
    appendNotification,
    applyServerNotifications,
    captureNotificationRequest,
    setOnlineCount,
  });

  const {
    friends, onlineStatus, unreadCounts,
    friendshipStatus, getPendingRequestId,
    sendFriendRequest, acceptRequest, rejectRequest, clearUnread,
  } = useFriends({ user, socketRef });

  // ── Parse ?fp= share link ─────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fpId = params.get('fp');
    if (fpId) {
      setShareTarget(fpId);
    }
  }, [setShareTarget]);

  useEffect(() => {
    if (footprintEvent?.type === 'new') addPulseId(footprintEvent.footprint?._id);
  }, [addPulseId, footprintEvent, footprintEventId]);

  useEffect(() => {
    if (activeFootprintId) addPulseId(activeFootprintId);
  }, [activeFootprintId, addPulseId]);

  useEffect(() => {
    const visibleIds = new Set(footprints.map((footprint) => footprint._id));
    if (mapPreviewId && !visibleIds.has(mapPreviewId)) setMapPreviewId(null);
    if (samePlaceIds?.length && samePlaceIds.some((id) => !visibleIds.has(id))) closeSamePlace();
  }, [closeSamePlace, footprints, mapPreviewId, samePlaceIds, setMapPreviewId]);

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
  }, [flyArrivedFp, footprints, setFlyArrivedFp]);

  // ── Footprint actions are provided by FootprintActionsProvider below ──

  const handleLogout = () => {
    logout();
    clearNotifications();
    refetchFootprints();
  };

  // ── Derived values ─────────────────────────────────────

  const mapPreviewFootprint = useMemo(
    () => footprints.find((footprint) => footprint._id === mapPreviewId) || null,
    [footprints, mapPreviewId],
  );
  const hasActiveMapFilters = mapQuery.relationship !== DEFAULT_MAP_QUERY.relationship
    || mapQuery.period !== DEFAULT_MAP_QUERY.period
    || mapQuery.content !== DEFAULT_MAP_QUERY.content
    || Boolean(mapQuery.query);
  const emptyReason = hasActiveMapFilters
    ? 'filters'
    : mapQuery.scope !== 'global' ? 'scope' : 'account';

  // Derived: friend info for ChatWindow (async fallback for non-friend admin chats)
  const chatFriendMeta = useChatFriendMeta(chatUserId, friends);

  const totalFriendUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
  const activeDestination = useShellStore((state) => state.activeDestination);
  const setActiveDestination = useShellStore((state) => state.setActiveDestination);
  const destinationSurfaceBehindAuthIsOpen = (
    activeDestination === 'activity'
    || (activeDestination === 'messages' && showFriends)
    || (activeDestination === 'me' && Boolean(user))
  );
  const handleActivityRequireLogin = useCallback((action, item) => {
    activityPendingTargetRef.current = item || null;
    return requireLogin({ ...action, source: 'activity' });
  }, [requireLogin]);
  const bottomNavigationLayer = destinationSurfaceBehindAuthIsOpen
    ? 'destination'
    : showAuth && activeDestination !== 'map'
      ? 'destination-auth'
      : 'base';

  const handleDestinationChange = (nextDestination) => {
    if (nextDestination === activeDestination) return;

    if (activeDestination === 'activity') setActivityDetailFp(null);
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
            <Suspense fallback={<LegacySurfaceFallback surface="announcement" />}>
              <AnnouncementPanel
                key="announcements"
                isOpen={showAnnouncements}
                onClose={() => { closeAnnouncements(); clearAnnounceUnread(); }}
                isAsen={isAsen}
                onToast={(msg) => useUIStore.getState().addToast({ type: 'announcement', content: msg })}
              />
            </Suspense>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showFriends && (
            <FriendsPanel
              key="friends"
              isOpen={showFriends}
              reserveMobileNavigation={bottomNavigationLayer === 'destination' && activeDestination === 'messages'}
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
          loading={footprintsLoading}
          fetching={mapFootprintsQuery.isFetching}
          error={footprintsError}
          onRetry={refetchFootprints}
          query={mapQuery}
          queryContext={effectiveMapQuery}
          viewerKey={viewerKey}
          isAuthenticated={Boolean(user)}
          locationContext={locationContext.scopeContext}
          locationReminder={locationContext}
          onQueryChange={handleMapQueryChange}
          onRequestLocation={locationContext.requestLocation}
          onSetFixedScope={locationContext.setFixedScope}
          onClearFixedScope={locationContext.clearFixedScope}
          onSelectFootprint={(footprint) => {
            setMapPreviewId(footprint?._id || null);
            addPulseId(footprint?._id);
          }}
          pulseIds={pulseIds}
          selectedId={mapPreviewId || activeFootprintId}
          onPulseComplete={handlePulseComplete}
          emptyReason={emptyReason}
          onClearFilters={() => handleMapQueryChange({
            ...mapQuery,
            relationship: DEFAULT_MAP_QUERY.relationship,
            period: DEFAULT_MAP_QUERY.period,
            content: DEFAULT_MAP_QUERY.content,
            query: '',
          })}
          onExpandScope={() => handleMapQueryChange({
            ...mapQuery,
            scope: 'global',
            countryCode: undefined,
            regionCode: undefined,
          })}
        />

        <MapPreviewCard
          footprint={mapPreviewFootprint}
          userId={user?._id}
          onClose={() => setMapPreviewId(null)}
          onOpenProfile={openProfile}
          onOpenDetail={() => { setMapPreviewId(null); setFlyArrivedFp(mapPreviewFootprint); }}
        />

        {/* Desktop side buttons */}
        <div className="hidden md:flex absolute z-[1000] flex-col gap-2.5 transform-gpu will-change-transform"
          style={{ top: `max(88px, calc(env(safe-area-inset-top) + 64px))`, right: `max(12px, env(safe-area-inset-right))` }}>
          <button
            onClick={() => openTimeline()}
            className="bliver-desktop-shortcut"
          >
            <Clock className="w-4 h-4" />
            <span>足迹记录</span>
          </button>
          <button
            onClick={() => openPhotoWall()}
            className="bliver-desktop-shortcut"
          >
            <Image className="w-4 h-4" />
            <span>照片墙</span>
          </button>
        </div>


        <CheckInModal
          isOpen={showCheckIn}
          onClose={() => { closeCheckIn(); setPendingCheckInLocation(null); }}
          presetLocation={pendingCheckInLocation}
        />

        <FootprintActionsProvider user={user} requireLogin={requireLogin} setFootprints={setFootprints}>
          {activeDestination === 'activity' && (
            <div className="bliver-activity-destination fixed inset-0 z-[1200] overflow-y-auto">
              <ActivityPage
                viewer={user}
                requireLogin={requireLogin}
                onRequireLogin={handleActivityRequireLogin}
                locationContext={locationContext.scopeContext}
                onRequestLocation={locationContext.requestLocation}
                onReact={setActivityDetailFp}
                onComment={setActivityDetailFp}
              />
            </div>
          )}

          <TimelineDrawer
            isOpen={showTimeline}
            reserveMobileNavigation={showTimeline && bottomNavigationLayer === 'destination' && activeDestination === 'activity'}
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
            {((activeDestination === 'activity' && activityDetailFp) || flyArrivedFp) && (
              <FootprintDetailModal
                key={(activeDestination === 'activity' && activityDetailFp ? activityDetailFp : flyArrivedFp)._id}
                fp={activeDestination === 'activity' && activityDetailFp ? activityDetailFp : flyArrivedFp}
                allFootprints={footprints}
                userId={user?._id}
                isAdmin={isAdmin}
                pendingAction={restoredAction?.footprintId === (
                  activeDestination === 'activity' && activityDetailFp
                    ? activityDetailFp._id
                    : flyArrivedFp?._id
                ) ? restoredAction : null}
                onPendingActionConsumed={consumePendingAction}
                onClose={() => {
                  if (activeDestination === 'activity' && activityDetailFp) setActivityDetailFp(null);
                  else { setFlyArrivedFp(null); setActiveFootprintId(null); }
                }}
              />
            )}
          </AnimatePresence>

          {samePlaceIds?.length > 0 && (
            <SamePlaceSheet
              ids={samePlaceIds}
              footprints={footprints}
              onSelect={setMapPreviewId}
              onClose={() => { closeSamePlace(); setActiveFootprintId(null); }}
            />
          )}
        </FootprintActionsProvider>

        <LegacyDestinationBridge
          destination={activeDestination}
          user={user}
          openFriends={openFriends}
          openProfile={openProfile}
          openAuth={openAuth}
        />

        {activeDestination === 'me' && user && !viewingProfileId && (
          <div className="bliver-me-destination fixed inset-0 z-[1200] overflow-hidden">
            <MeExperience
              userId={user._id}
              onClose={() => setActiveDestination('map')}
              onLogout={() => { setActiveDestination('map'); handleLogout(); }}
              onSelectFootprint={(fpId) => { setActiveDestination('map'); setActiveFootprintId(fpId); }}
              onOpenTimeline={openTimeline}
              onOpenPhotoWall={openPhotoWall}
              onOpenSettings={openFriends}
            />
          </div>
        )}

        {showAdmin && (
          <ErrorBoundary surface="admin">
            <Suspense fallback={<LegacySurfaceFallback surface="admin" />}>
              <AdminPanel onClose={() => closeAdmin()} socketRef={socketRef} />
            </Suspense>
          </ErrorBoundary>
        )}

        {showPhotoWall && (
          <Suspense fallback={<LegacySurfaceFallback surface="photo" />}>
            <PhotoWall
              footprints={footprints}
              onClose={() => closePhotoWall()}
              onSelect={(fpId) => { closePhotoWall(); setTimelineTargetFpId(fpId); }}
            />
          </Suspense>
        )}

        <AboutModal isOpen={showAbout} onClose={() => closeAbout()} user={user} />
        <FeedbackModal isOpen={showFeedback} onClose={closeFeedback} />

        {showAuth && (
          <AuthModal
            initialTab={authTab}
            message={authMessage}
            reserveMobileNavigation={bottomNavigationLayer === 'destination-auth'}
            onDone={(u) => {
              const pendingAction = pendingActionRef.current;
              const pendingActivity = pendingAction?.source === 'activity'
                ? activityPendingTargetRef.current
                : null;
              activityPendingTargetRef.current = null;
              setUser(u);
              closeAuth();
              if (pendingActivity) {
                setActivityDetailFp(pendingActivity);
                setActiveDestination('activity');
              } else if (!destinationSurfaceBehindAuthIsOpen) setActiveDestination('map');
              setTimeout(() => broadcastLogin(u), 0);
              subscribeToPush().catch(() => {});
            }}
            onClose={() => { closeAuth(); if (!destinationSurfaceBehindAuthIsOpen) setActiveDestination('map'); }}
          />
        )}

        <AnimatePresence>
          {viewingProfileId && (
            <ErrorBoundary key={viewingProfileId}>
              <ProfileDrawer
                userId={viewingProfileId}
                reserveMobileNavigation={bottomNavigationLayer === 'destination' && activeDestination === 'me'}
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
