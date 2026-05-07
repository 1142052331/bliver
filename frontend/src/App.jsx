import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { io } from 'socket.io-client';
import api from './api';
import { getUser, getToken, clearAuth } from './auth';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { MapPin, Heart } from 'lucide-react';

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

function RecenterOnLoad({ footprints }) {
  const map = useMap();
  useEffect(() => {
    if (footprints.length > 0) {
      const last = footprints[0];
      map.setView([last.location.lat, last.location.lng], map.getZoom());
    }
  }, []);
  return null;
}

function FootprintPopupContent({ fp, userId, onLike }) {
  const liked = fp.likes?.some((l) => (l._id || l) === userId);
  const likeCount = fp.likes?.length || 0;

  return (
    <div className="min-w-[200px] text-sm">
      <div className="flex items-center gap-2 mb-2">
        {fp.userId?.avatarUrl ? (
          <img src={fp.userId.avatarUrl} className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
            {fp.userId?.name?.[0]?.toUpperCase() || '?'}
          </div>
        )}
        <span className="font-semibold">{fp.userId?.name || 'Unknown'}</span>
      </div>
      <p className="text-gray-500 mb-1">📍 {fp.placeName || 'Unknown location'}</p>
      <p className="text-gray-700 mb-2 whitespace-pre-wrap">{fp.message}</p>
      {fp.photoUrl && (
        <img src={fp.photoUrl} className="w-full max-h-[180px] object-cover rounded-lg mt-2" />
      )}
      {/* Like */}
      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">
        <button
          onClick={(e) => { e.stopPropagation(); onLike(fp._id); }}
          className="flex items-center gap-1 text-xs hover:scale-110 transition-transform"
        >
          <Heart className={`w-4 h-4 ${liked ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
        </button>
        {likeCount > 0 && (
          <span className="text-xs text-gray-500">{likeCount}</span>
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

  // Restore user from localStorage
  useEffect(() => {
    const saved = getUser();
    if (saved && getToken()) {
      setUser(saved);
    } else {
      clearAuth();
    }
  }, []);

  // Fetch footprints & connect Socket
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

    return () => { socket.disconnect(); };
  }, [user]);

  const handleLike = async (footprintId) => {
    try {
      const { data } = await api.post(`/api/footprints/${footprintId}/like`);
      setFootprints((prev) =>
        prev.map((fp) => (fp._id === data.footprint._id ? data.footprint : fp))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    clearAuth();
    setUser(null);
    setFootprints([]);
  };

  if (!user) return <AuthModal onDone={setUser} />;

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <NavBar onlineCount={onlineCount} user={user} onLogout={handleLogout} />

      <MapContainer center={CENTER} zoom={6} scrollWheelZoom className="w-full h-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RecenterOnLoad footprints={footprints} />
        {footprints.map((fp) => (
          <Marker key={fp._id} position={[fp.location.lat, fp.location.lng]}>
            <Popup>
              <FootprintPopupContent fp={fp} userId={user._id} onLike={handleLike} />
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
      />
    </div>
  );
}
