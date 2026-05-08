import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Routes, Route } from 'react-router-dom';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { io } from 'socket.io-client';
import api from './api';
import { getUser, getToken, clearAuth, saveAuth } from './auth';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { MapPin } from 'lucide-react';

import NavBar from './components/NavBar';
import AuthModal from './components/AuthModal';
import CheckInModal from './components/CheckInModal';
import TimelineDrawer from './components/TimelineDrawer';
import ClusterMarkers from './components/ClusterMarkers';
import ClusterDetailPanel from './components/ClusterDetailPanel';
import NotificationPanel from './components/NotificationPanel';
import MapLayers from './components/MapLayers';
import AdminPanel from './components/AdminPanel';
import FlyToFootprint from './components/FlyToFootprint';
import ProfileDrawer from './components/ProfileDrawer';
import FootprintDetailModal from './components/FootprintDetailModal';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const CENTER = [33.5597, 133.5311];
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

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

  useEffect(() => {
    const saved = getUser();
    if (saved && getToken()) {
      api.get('/api/auth/me').then((res) => {
        const u = res.data.user;
        setUser(u);
        saveAuth({ _id: u._id, name: u.name, avatarUrl: u.avatarUrl, role: u.role }, getToken());
      }).catch(() => {
        clearAuth();
        setUser(null);
      });
    } else {
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

  // Fetch footprints on mount (guest-accessible)
  useEffect(() => {
    api.get('/api/footprints/today').then((res) => {
      setFootprints(res.data.footprints);
    }).catch(() => {});
  }, []);

  // Re-fetch footprints when user changes (login/logout)
  useEffect(() => {
    if (!user) return;
    api.get('/api/footprints/today').then((res) => {
      setFootprints(res.data.footprints);
    }).catch(() => {});
  }, [user]);

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

    const socket = io(SOCKET_URL);
    socket.emit('user:online', user._id);

    socket.on('online:count', (data) => setOnlineCount(data.count));

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
        : `${n.senderName} 评论了你`;
      setToast(msg);
      setTimeout(() => setToast(null), 4000);
    });

    socket.on('force_logout', (data) => {
      clearAuth();
      alert(data?.reason || '您已被管理员踢出');
      setUser(null);
    });

    return () => { socket.disconnect(); };
  }, [user]);

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
    // Re-fetch footprints for guest view
    api.get('/api/footprints/today').then((res) => {
      setFootprints(res.data.footprints);
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
    <div className="relative w-full h-screen overflow-hidden">
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

      <MapContainer key="map" center={CENTER} zoom={6} scrollWheelZoom className="w-full h-full">
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
        <MapLayers />
        <ClusterMarkers
          footprints={footprints}
          userId={user?._id}
          isAdmin={isAdmin}
        />
      </MapContainer>

      <button
        onClick={() => {
          if (!requireLogin({ type: 'checkin' })) return;
          setShowCheckIn(true);
        }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] px-8 py-4
          bg-blue-600 text-white rounded-full font-bold text-base shadow-lg shadow-blue-600/30
          hover:bg-blue-700 hover:shadow-blue-600/40 active:scale-95
          transition-all duration-200 flex items-center gap-2"
      >
        <MapPin className="w-5 h-5" />
        Check In Here
      </button>

      <button
        onClick={() => setShowTimeline(true)}
        className="absolute top-20 right-3 z-[1000] px-4 py-2 bg-white/80 backdrop-blur rounded-xl
          text-sm font-medium text-gray-700 shadow-md border border-gray-200/60
          hover:bg-white transition-colors"
      >
        Today&apos;s Journey →
      </button>

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

      {/* Auth Modal Overlay */}
      {showAuth && (
        <AuthModal
          initialTab={authTab}
          message={authMessage}
          onDone={(u) => { setUser(u); setShowAuth(false); }}
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
        <div className="fixed top-16 right-4 z-[1900] px-4 py-2.5 bg-gray-900 text-white text-sm
          rounded-xl shadow-lg animate-slide-down">
          {toast}
        </div>
      )}

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-down { animation: slideDown 0.3s ease-out; }
      `}</style>
    </div>
  );

  return (
    <Routes>
      <Route path="*" element={mapDashboard} />
    </Routes>
  );
}
