import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
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
import ProfileDrawer from './components/ProfileDrawer';
import FootprintDetailModal from './components/FootprintDetailModal';
import ErrorBoundary from './components/ErrorBoundary';
import PhotoWall from './components/PhotoWall';
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

function RecenterOnLoad({ footprints, targetId }) {
  const map = useMap();
  useEffect(() => {
    if (targetId) {
      const fp = footprints.find((f) => f._id === targetId);
      if (fp) {
        setTimeout(() => {
          map.setView([fp.location.lat, fp.location.lng], 14);
        }, 500);
      }
    } else if (footprints.length > 0) {
      const last = footprints[0];
      map.setView([last.location.lat, last.location.lng], map.getZoom());
    }
  }, []);
  return null;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [footprints, setFootprints] = useState([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);
  const [clusterData, setClusterData] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [toast, setToast] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [activeFootprintId, setActiveFootprintId] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authTab, setAuthTab] = useState('login');
  const [authMessage, setAuthMessage] = useState('');
  const pendingActionRef = useRef(null);
  const [viewingProfileId, setViewingProfileId] = useState(null);
  const [flyArrivedFp, setFlyArrivedFp] = useState(null);
  const [footprintPeriod, setFootprintPeriod] = useState('today');
  const [footprintsLoading, setFootprintsLoading] = useState(true);
  const [showPhotoWall, setShowPhotoWall] = useState(false);

  useEffect(() => {
    const saved = getUser();
    // Only auto-login if the user enabled it
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fpId = params.get('fp');
    if (fpId) {
      setShareTarget(fpId);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // Fetch footprints when period changes
  useEffect(() => {
    setFootprintsLoading(true);
    api.get(`/api/footprints/today?period=${footprintPeriod}`).then((res) => {
      if (res?.data?.footprints) setFootprints(res.data.footprints);
    }).catch(() => {}).finally(() => {
      setFootprintsLoading(false);
    });
  }, [footprintPeriod]);

  // Socket connection + notifications (logged-in only)
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
    socket.on('connect', () => console.log('[Socket] Connected:', socket.id));
    socket.on('connect_error', (e) => console.error('[Socket] Connect error:', e.message));
    socket.on('disconnect', (reason) => console.log('[Socket] Disconnected:', reason));
    socket.emit('user:online', user._id);

    socket.on('online:count', (data) => {
      console.log('[Socket] online:count:', data.count);
      setOnlineCount(data.count);
    });

    socket.on('footprint:new', (data) => {
      console.log('[Socket] footprint:new:', data.footprint?._id?.slice(-6), data.footprint?.placeName);
      setFootprints((prev) => [data.footprint, ...prev]);
      window.dispatchEvent(new CustomEvent('ws:footprint:new', { detail: data }));
    });

    socket.on('footprint:updated', (data) => {
      console.log('[Socket] footprint:updated:', data.footprint?._id?.slice(-6));
      setFootprints((prev) =>
        prev.map((fp) => (fp._id === data.footprint._id
          ? { ...fp, reactions: data.footprint.reactions, comments: data.footprint.comments }
          : fp))
      );
      window.dispatchEvent(new CustomEvent('ws:footprint:updated', { detail: data }));
    });

    socket.on('footprint:deleted', (data) => {
      console.log('[Socket] footprint:deleted:', data.footprintId?.slice(-6));
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
        : `${n.senderName} 评论了你`;
      setToast(msg);
      setTimeout(() => setToast(null), 4000);
    });

    socket.on('user_online', (data) => {
      setToast(`${data.name} 上线了`);
      setTimeout(() => setToast(null), 3000);
    });

    socket.on('user_offline', (data) => {
      setToast(`${data.name} 下线了`);
      setTimeout(() => setToast(null), 3000);
    });

    socket.on('force_logout', (data) => {
      clearAuth();
      alert(data?.reason || '您已被管理员踢出');
      setUser(null);
    });

    return () => { socket.disconnect(); };
  }, [user]);

  // Keep flyArrivedFp in sync with latest footprints data
  useEffect(() => {
    if (flyArrivedFp) {
      const latest = footprints.find((f) => f._id === flyArrivedFp._id);
      if (latest && (latest.comments !== flyArrivedFp.comments || latest.reactions !== flyArrivedFp.reactions)) {
        setFlyArrivedFp(latest);
      }
    }
  }, [footprints, flyArrivedFp]);

  // Execute pending action after login
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
      console.error(err);
    }
  }, [user]);

  const handleDelete = useCallback(async (footprintId) => {
    if (!requireLogin({ type: 'delete', footprintId })) return;
    if (!confirm('确认删除这条足迹？')) return;
    try {
      await api.delete(`/api/footprints/${footprintId}`);
    } catch (err) {
      console.error(err);
    }
  }, [user]);

  const handleShare = useCallback((footprintId) => {
    const url = `${window.location.origin}${window.location.pathname}?fp=${footprintId}`;
    navigator.clipboard.writeText(url);
  }, []);

  const handleComment = useCallback(async (footprintId, content) => {
    if (!requireLogin({ type: 'comment', footprintId })) return;
    const { data } = await api.post(`/api/footprints/${footprintId}/comment`, { content });
    setFootprints((prev) =>
      prev.map((fp) => (fp._id === footprintId ? { ...fp, comments: data.footprint.comments } : fp))
    );
  }, [user]);

  const markAsRead = useCallback(async (notifId) => {
    setNotifications((prev) =>
      prev.map((n) => (n._id === notifId ? { ...n, isRead: true } : n))
    );
    await api.put(`/api/notifications/${notifId}/read`).catch(() => {});
  }, []);

  // Listen for cluster click events from ClusterMarkers
  useEffect(() => {
    const handler = (e) => setClusterData(e.detail);
    window.addEventListener('cluster:click', handler);
    return () => window.removeEventListener('cluster:click', handler);
  }, []);

  // Listen for profile view events
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

  // Derive latest cluster footprints from live footprints state
  const clusterFootprints = useMemo(() => {
    if (!clusterData) return null;
    const ids = new Set(clusterData.footprints.map(f => f._id));
    return footprints.filter(f => ids.has(f._id));
  }, [clusterData, footprints]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const isAdmin = user?.role === 'admin';

  // ── Map Dashboard view ──────────────────────────────────

  const mapDashboard = (
    <div className="relative w-full h-screen overflow-hidden"
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
        <ClusterMarkers
          footprints={footprints}
          userId={user?._id}
          isAdmin={isAdmin}
        />
      </MapContainer>

      {/* Check In button — below NavBar, left-aligned */}
      <button
        onClick={() => {
          if (!requireLogin({ type: 'checkin' })) return;
          setShowCheckIn(true);
        }}
        className="absolute top-[72px] left-3 z-[1000]
          aurora-btn px-4 py-2.5 rounded-xl text-sm tracking-wide text-white
          active:scale-[0.97] flex items-center gap-1.5"
        style={{ boxShadow: '0 4px 20px var(--aurora-glow-teal), 0 0 40px var(--aurora-glow-purple)' }}
      >
        <MapPin className="w-3.5 h-3.5" />
        留言
      </button>

      {/* Side buttons group */}
      <div className="absolute top-[88px] right-3 z-[1000] flex flex-col gap-2">
        <button
          onClick={() => setShowTimeline(true)}
          className="aurora-btn-glass px-4 py-2.5 rounded-2xl text-sm font-medium
            flex items-center gap-2"
        >
          <Clock className="w-4 h-4 text-teal-400" />
          <span className="text-white/80">今日记录</span>
        </button>

        <button
          onClick={() => setShowPhotoWall(true)}
          className="aurora-btn-glass px-4 py-2.5 rounded-2xl text-sm font-medium
            flex items-center gap-2"
        >
          <Image className="w-4 h-4 text-purple-400" />
          <span className="text-white/80">照片墙</span>
        </button>
      </div>

      <CheckInModal
        isOpen={showCheckIn}
        onClose={() => setShowCheckIn(false)}
      />

      <TimelineDrawer
        isOpen={showTimeline}
        onClose={() => setShowTimeline(false)}
        footprints={footprints}
        userId={user?._id}
        isAdmin={isAdmin}
        onReact={handleReact}
        onDelete={handleDelete}
        onShare={handleShare}
        onSelectFootprint={(fpId) => setActiveFootprintId(fpId)}
        period={footprintPeriod}
        onChangePeriod={setFootprintPeriod}
        loading={footprintsLoading}
      />

      {/* Fly-arrived detail modal (from timeline click) */}
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

      {/* Cluster drawer (from marker click) */}
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

      {/* Admin Panel */}
      {showAdmin && (
        <AdminPanel onClose={() => setShowAdmin(false)} />
      )}

      {/* Photo Wall */}
      {showPhotoWall && (
        <PhotoWall
          footprints={footprints}
          onClose={() => setShowPhotoWall(false)}
          onSelect={(fpId) => {
            setShowPhotoWall(false);
            setActiveFootprintId(fpId);
          }}
        />
      )}

      {/* Auth Modal Overlay */}
      {showAuth && (
        <AuthModal
          initialTab={authTab}
          message={authMessage}
          onDone={(u) => { setUser(u); setShowAuth(false); subscribeToPush().catch(() => {}); }}
          onClose={() => setShowAuth(false)}
        />
      )}

      {/* Profile Drawer */}
      {viewingProfileId && (
        <ProfileDrawer
          userId={viewingProfileId}
          onClose={() => setViewingProfileId(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[1900]
          px-5 py-3 bg-gray-900/90 backdrop-blur-md text-white text-sm font-medium
          rounded-2xl shadow-2xl shadow-black/20
          animate-slide-down flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-indigo-400 to-purple-400 flex-shrink-0" />
          {toast}
        </div>
      )}

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translate(-50%, -12px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        .animate-slide-down { animation: slideDown 0.4s cubic-bezier(0.2,0.8,0.2,1); }
      `}</style>
    </div>
  );

  return (
    <ErrorBoundary>
      {mapDashboard}
    </ErrorBoundary>
  );
}
