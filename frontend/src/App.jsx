import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import { io } from 'socket.io-client';
import api from './api';
import { getUser, getToken, clearAuth, saveAuth, isAutoLogin } from './auth';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { MapPin, Image, Clock } from 'lucide-react';

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
import Toast from './components/Toast';
import ProfileDrawer from './components/ProfileDrawer';
import FootprintDetailModal from './components/FootprintDetailModal';
import ErrorBoundary from './components/ErrorBoundary';
import PhotoWall from './components/PhotoWall';
import MobileActionDrawer from './components/MobileActionDrawer';
import { subscribeToPush } from './push';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const CENTER = [33.5597, 133.5311];

function getSocketURL() {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
  if (import.meta.env.VITE_API_URL) {
    try { return new URL(import.meta.env.VITE_API_URL).origin; } catch {}
  }
  return window.location.origin;
}

export default function App() {
  // ── Core state ────────────────────────────────────────
  const [user, setUser] = useState(null);
  const [footprints, setFootprints] = useState([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [toast, setToast] = useState(null);

  // ── UI visibility toggles ─────────────────────────────
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showPhotoWall, setShowPhotoWall] = useState(false);
  const [viewingProfileId, setViewingProfileId] = useState(null);

  // ── Auth / share / period ─────────────────────────────
  const [authTab, setAuthTab] = useState('login');
  const [authMessage, setAuthMessage] = useState('');
  const [shareTarget, setShareTarget] = useState(null);
  const [footprintPeriod, setFootprintPeriod] = useState('week');
  const [footprintsLoading, setFootprintsLoading] = useState(true);

  // ── Map interaction ───────────────────────────────────
  const [clusterData, setClusterData] = useState(null);
  const [activeFootprintId, setActiveFootprintId] = useState(null);
  const [flyArrivedFp, setFlyArrivedFp] = useState(null);
  const [timelineTargetFpId, setTimelineTargetFpId] = useState(null);

  // ── Refs ──────────────────────────────────────────────
  const pendingActionRef = useRef(null);
  const socketRef = useRef(null);
  const toastTimerRef = useRef(null);

  // ── Read-notification tracking (React state + localStorage persistence) ──
  const READ_KEY = 'bliver_read_v2';
  const [readIds, setReadIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(READ_KEY)) || []); }
    catch { return new Set(); }
  });

  // ── Auto-login on mount ───────────────────────────────
  useEffect(() => {
    const saved = getUser();
    if (saved && getToken() && isAutoLogin()) {
      api.get('/api/auth/me').then((res) => {
        const u = res.data.user;
        setUser(u);
        saveAuth({ _id: u._id, name: u.name, avatarUrl: u.avatarUrl, role: u.role }, getToken());
        subscribeToPush().catch(() => {});
      }).catch(() => {
        clearAuth();
        setUser(null);
      });
    } else if (!isAutoLogin()) {
      clearAuth();
    }
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

  // ── Fetch footprints when period changes ──────────────
  useEffect(() => {
    setFootprintsLoading(true);
    api.get(`/api/footprints/today?period=${footprintPeriod}`).then((res) => {
      if (res?.data?.footprints) setFootprints(res.data.footprints);
    }).catch(() => {}).finally(() => {
      setFootprintsLoading(false);
    });
  }, [footprintPeriod]);

  // ── Visibility change: refresh data on foreground ─────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible' || !user) return;

      if (socketRef.current && !socketRef.current.connected) {
        socketRef.current.connect();
        socketRef.current.emit('user:online', user._id);
      }

      api.get(`/api/footprints/today?period=${footprintPeriod}`).then((res) => {
        if (res?.data?.footprints) setFootprints(res.data.footprints);
      }).catch(() => {});

      api.get('/api/notifications').then((res) => {
        setNotifications(res.data.notifications);
      }).catch(() => {});
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [user, footprintPeriod]);

  // ── Socket connection (logged-in only) ────────────────
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setOnlineCount(0);
      return;
    }

    api.get('/api/notifications').then((res) => {
      setNotifications(res.data.notifications);
    }).catch(() => {});

    const socketUrl = getSocketURL();
    console.log('[Socket] Connecting to:', socketUrl);
    const socket = io(socketUrl);
    socketRef.current = socket;
    socket.on('connect', () => console.log('[Socket] Connected:', socket.id));
    socket.on('connect_error', (e) => console.error('[Socket] Connect error:', e.message));
    socket.on('disconnect', (reason) => console.log('[Socket] Disconnected:', reason));
    socket.emit('user:online', user._id);

    socket.on('online:count', (data) => {
      setOnlineCount(data.count);
    });

    socket.on('footprint:new', (data) => {
      setFootprints((prev) => [data.footprint, ...prev]);
      window.dispatchEvent(new CustomEvent('ws:footprint:new', { detail: data }));
    });

    socket.on('footprint:updated', (data) => {
      setFootprints((prev) =>
        prev.map((fp) => (fp._id === data.footprint._id
          ? { ...fp, reactions: data.footprint.reactions, comments: data.footprint.comments }
          : fp))
      );
      window.dispatchEvent(new CustomEvent('ws:footprint:updated', { detail: data }));
    });

    socket.on('footprint:deleted', (data) => {
      setFootprints((prev) => prev.filter((fp) => fp._id !== data.footprintId));
      window.dispatchEvent(new CustomEvent('ws:footprint:deleted', { detail: data }));
    });

    socket.on('profile:updated', (data) => {
      window.dispatchEvent(new CustomEvent('ws:profile:updated', { detail: data }));
    });

    socket.on('new_notification', (data) => {
      setNotifications((prev) => [data.notification, ...prev]);
      const n = data.notification;
      const msg = n.type === 'reaction'
        ? `${n.senderName} 对你的打卡表示了 ${n.content}`
        : n.type === 'profile_view'
          ? `${n.senderName} 浏览了你的主页`
          : `${n.senderName} 评论了你`;
      setToast(msg);
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToast(null), 4000);
    });

    socket.on('user_online', (data) => {
      setToast(`${data.name} 上线了`);
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToast(null), 3000);
    });

    socket.on('user_offline', (data) => {
      setToast(`${data.name} 下线了`);
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToast(null), 3000);
    });

    socket.on('force_logout', (data) => {
      clearAuth();
      alert(data?.reason || '您已被管理员踢出');
      setUser(null);
    });

    return () => {
      clearTimeout(toastTimerRef.current);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  // ── Keep flyArrivedFp synced with latest footprints ────
  useEffect(() => {
    if (flyArrivedFp) {
      const latest = footprints.find((f) => f._id === flyArrivedFp._id);
      if (latest && (latest.comments !== flyArrivedFp.comments || latest.reactions !== flyArrivedFp.reactions)) {
        setFlyArrivedFp(latest);
      }
    }
  }, [footprints, flyArrivedFp]);

  // ── Execute pending action after login ─────────────────
  useEffect(() => {
    if (user && pendingActionRef.current) {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      if (action.type === 'checkin') {
        setShowCheckIn(true);
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
      setShowAuth(true);
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
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }, [user]);

  const handleShare = useCallback((footprintId) => {
    const url = `${window.location.origin}${window.location.pathname}?fp=${footprintId}`;
    navigator.clipboard.writeText(url);
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
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(notifId);
      try { localStorage.setItem(READ_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
    setNotifications((prev) =>
      prev.map((n) => (n._id === notifId ? { ...n, isRead: true } : n))
    );
    await api.put(`/api/notifications/${notifId}/read`).catch(() => {});
  }, []);

  // ── Event listeners ────────────────────────────────────

  useEffect(() => {
    const handler = (e) => setClusterData(e.detail);
    window.addEventListener('cluster:click', handler);
    return () => window.removeEventListener('cluster:click', handler);
  }, []);

  useEffect(() => {
    const handler = (e) => setViewingProfileId(e.detail.userId);
    window.addEventListener('profile:view', handler);
    return () => window.removeEventListener('profile:view', handler);
  }, []);

  const handleLogout = () => {
    clearAuth();
    setUser(null);
    setNotifications([]);
    api.get(`/api/footprints/today?period=${footprintPeriod}`).then((res) => {
      if (res?.data?.footprints) setFootprints(res.data.footprints);
    }).catch(() => {});
  };

  // ── Derived values ─────────────────────────────────────

  const clusterFootprints = useMemo(() => {
    if (!clusterData) return null;
    const ids = new Set(clusterData.footprints.map(f => f._id));
    return footprints.filter(f => ids.has(f._id));
  }, [clusterData, footprints]);

  const unreadCount = notifications.filter((n) => !readIds.has(n._id)).length;
  const isAdmin = user?.role === 'admin';

  // ── Render ─────────────────────────────────────────────

  return (
    <ErrorBoundary>
      <div className="relative w-full h-dvh overflow-hidden"
        style={{ background: 'var(--aurora-deep)' }}>
        <NavBar
          onlineCount={onlineCount}
          user={user}
          onLogout={handleLogout}
          unreadCount={unreadCount}
          onBellClick={() => setShowNotifs((v) => !v)}
          isAdmin={isAdmin}
          onOpenAdmin={() => setShowAdmin(true)}
          onOpenLogin={() => { setAuthTab('login'); setAuthMessage(''); setShowAuth(true); }}
          onOpenRegister={() => { setAuthTab('register'); setAuthMessage(''); setShowAuth(true); }}
          onCheckIn={() => {
            if (!requireLogin({ type: 'checkin' })) return;
            setShowCheckIn(true);
          }}
        />

        {showNotifs && (
          <NotificationPanel
            notifications={notifications}
            onClose={() => setShowNotifs(false)}
            onMarkRead={markAsRead}
          />
        )}

        <MapContainer key="map" center={CENTER} zoom={6} scrollWheelZoom zoomControl={false} className="w-full h-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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
        <div className="hidden md:flex absolute top-[88px] z-[1000] flex-col gap-2"
          style={{ right: `max(12px, env(safe-area-inset-right))` }}>
          <button
            onClick={() => setShowTimeline(true)}
            className="aurora-btn-glass px-4 py-2.5 rounded-2xl text-sm font-medium flex items-center gap-2"
          >
            <Clock className="w-4 h-4 text-teal-400" />
            <span className="text-white/80">足迹记录</span>
          </button>
          <button
            onClick={() => setShowPhotoWall(true)}
            className="aurora-btn-glass px-4 py-2.5 rounded-2xl text-sm font-medium flex items-center gap-2"
          >
            <Image className="w-4 h-4 text-purple-400" />
            <span className="text-white/80">照片墙</span>
          </button>
        </div>

        <CheckInModal isOpen={showCheckIn} onClose={() => setShowCheckIn(false)} />

        <TimelineDrawer
          isOpen={showTimeline}
          onClose={() => setShowTimeline(false)}
          footprints={footprints}
          userId={user?._id}
          isAdmin={isAdmin}
          onReact={handleReact}
          onDelete={handleDelete}
          onShare={handleShare}
          onSelectFootprint={(fpId) => { setShowTimeline(false); setTimelineTargetFpId(fpId); }}
          period={footprintPeriod}
          onChangePeriod={setFootprintPeriod}
          loading={footprintsLoading}
        />

        <MobileActionDrawer
          user={user}
          isAdmin={isAdmin}
          unreadCount={unreadCount}
          onCheckIn={() => {
            if (!requireLogin({ type: 'checkin' })) return;
            setShowCheckIn(true);
          }}
          onTimeline={() => setShowTimeline(true)}
          onPhotoWall={() => setShowPhotoWall(true)}
          onProfile={(uid) => setViewingProfileId(uid)}
          onBell={() => setShowNotifs((v) => !v)}
          onOpenAdmin={() => setShowAdmin(true)}
          onOpenLogin={() => { setAuthTab('login'); setAuthMessage(''); setShowAuth(true); }}
          onOpenRegister={() => { setAuthTab('register'); setAuthMessage(''); setShowAuth(true); }}
        />

        {flyArrivedFp && (
          <FootprintDetailModal
            fp={flyArrivedFp}
            userId={user?._id}
            isAdmin={isAdmin}
            onReact={handleReact}
            onDelete={handleDelete}
            onShare={handleShare}
            onComment={handleComment}
            onClose={() => { setFlyArrivedFp(null); setActiveFootprintId(null); }}
          />
        )}

        {clusterFootprints && (
          <ClusterDetailPanel
            footprints={clusterFootprints}
            userId={user?._id}
            isAdmin={isAdmin}
            onReact={handleReact}
            onDelete={handleDelete}
            onShare={handleShare}
            onComment={handleComment}
            onClose={() => { setClusterData(null); setActiveFootprintId(null); }}
          />
        )}

        {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}

        {showPhotoWall && (
          <PhotoWall
            footprints={footprints}
            onClose={() => setShowPhotoWall(false)}
            onSelect={(fpId) => { setShowPhotoWall(false); setTimelineTargetFpId(fpId); }}
          />
        )}

        {showAuth && (
          <AuthModal
            initialTab={authTab}
            message={authMessage}
            onDone={(u) => { setUser(u); setShowAuth(false); subscribeToPush().catch(() => {}); }}
            onClose={() => setShowAuth(false)}
          />
        )}

        {viewingProfileId && (
          <ProfileDrawer
            userId={viewingProfileId}
            onClose={() => setViewingProfileId(null)}
            onLogout={() => { setViewingProfileId(null); handleLogout(); }}
          />
        )}

        <Toast message={toast} />

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
