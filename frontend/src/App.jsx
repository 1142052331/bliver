import { useEffect, useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { io } from 'socket.io-client';
import api from './api';
import { getUser, getToken, clearAuth, saveAuth } from './auth';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { MapPin, Heart, Trash2, Share2, Copy, Check } from 'lucide-react';

import NavBar from './components/NavBar';
import AuthModal from './components/AuthModal';
import CheckInModal from './components/CheckInModal';
import TimelineDrawer from './components/TimelineDrawer';

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
        map.setView([fp.location.lat, fp.location.lng], 14);
      }
    } else if (footprints.length > 0) {
      const last = footprints[0];
      map.setView([last.location.lat, last.location.lng], map.getZoom());
    }
  }, []);
  return null;
}

function FootprintPopupContent({ fp, userId, isAdmin, onLike, onDelete, onShare }) {
  const liked = fp.likes?.some((l) => (l._id || l) === userId);
  const likeCount = fp.likes?.length || 0;
  const likeNames = fp.likes?.map((l) => l.name || '?').join(', ') || '';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onShare(fp._id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-w-[220px] text-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {fp.userId?.avatarUrl ? (
            <img src={fp.userId.avatarUrl} className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
              {fp.userId?.name?.[0]?.toUpperCase() || '?'}
            </div>
          )}
          <span className="font-semibold">{fp.userId?.name || 'Unknown'}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleCopy} className="p-1 hover:bg-gray-100 rounded" title="Copy share link">
            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Share2 className="w-3.5 h-3.5 text-gray-400" />}
          </button>
          {isAdmin && (
            <button
              onClick={() => onDelete(fp._id)}
              className="p-1 hover:bg-red-50 rounded"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </button>
          )}
        </div>
      </div>

      <p className="text-gray-500 mb-1">📍 {fp.placeName || 'Unknown location'}</p>
      <p className="text-gray-700 mb-2 whitespace-pre-wrap">{fp.message}</p>
      {fp.photoUrl && (
        <img src={fp.photoUrl} className="w-full max-h-[180px] object-cover rounded-lg mt-2" />
      )}

      {/* Likes */}
      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">
        <button
          onClick={() => onLike(fp._id)}
          className="flex items-center gap-1 hover:scale-110 transition-transform"
        >
          <Heart className={`w-4 h-4 ${liked ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
        </button>
        {likeCount > 0 && (
          <span className="text-xs text-gray-500" title={likeNames}>
            {likeCount} {likeNames && `— ${likeNames}`}
          </span>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [footprints, setFootprints] = useState([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const saved = getUser();
    if (saved && getToken()) {
      // Refresh user from server to get latest role
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

  // Check for shared footprint in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fpId = params.get('fp');
    if (fpId) {
      setShareTarget(fpId);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [footprints.length === 0]); // only on first load

  useEffect(() => {
    if (!user) return;

    api.get('/api/footprints/today').then((res) => {
      setFootprints(res.data.footprints);
    });

    const socket = io(SOCKET_URL);
    socket.emit('user:online', user._id);

    socket.on('online:count', (data) => setOnlineCount(data.count));

    socket.on('footprint:new', (data) => {
      setFootprints((prev) => [data.footprint, ...prev]);
    });

    socket.on('footprint:updated', (data) => {
      setFootprints((prev) =>
        prev.map((fp) => (fp._id === data.footprint._id ? data.footprint : fp))
      );
    });

    socket.on('footprint:deleted', (data) => {
      setFootprints((prev) => prev.filter((fp) => fp._id !== data.footprintId));
    });

    return () => { socket.disconnect(); };
  }, [user]);

  const handleLike = useCallback(async (footprintId) => {
    try {
      const { data } = await api.post(`/api/footprints/${footprintId}/like`);
      setFootprints((prev) =>
        prev.map((fp) => (fp._id === data.footprint._id ? data.footprint : fp))
      );
    } catch (err) {
      console.error(err);
    }
  }, []);

  const handleDelete = useCallback(async (footprintId) => {
    if (!confirm('Delete this footprint?')) return;
    try {
      await api.delete(`/api/footprints/${footprintId}`);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const handleShare = useCallback((footprintId) => {
    const url = `${window.location.origin}${window.location.pathname}?fp=${footprintId}`;
    navigator.clipboard.writeText(url);
  }, []);

  const handleLogout = () => {
    clearAuth();
    setUser(null);
    setFootprints([]);
  };

  if (!user) return <AuthModal onDone={setUser} />;

  const isAdmin = user.role === 'admin';

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <NavBar onlineCount={onlineCount} user={user} onLogout={handleLogout} />

      <MapContainer center={CENTER} zoom={6} scrollWheelZoom className="w-full h-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RecenterOnLoad footprints={footprints} targetId={shareTarget} />
        {footprints.map((fp) => (
          <Marker key={fp._id} position={[fp.location.lat, fp.location.lng]}>
            <Popup>
              <FootprintPopupContent
                fp={fp}
                userId={user._id}
                isAdmin={isAdmin}
                onLike={handleLike}
                onDelete={handleDelete}
                onShare={handleShare}
              />
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <button
        onClick={() => setShowCheckIn(true)}
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
        userId={user._id}
        isAdmin={isAdmin}
        onLike={handleLike}
        onDelete={handleDelete}
        onShare={handleShare}
      />
    </div>
  );
}
