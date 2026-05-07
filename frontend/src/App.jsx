import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { io } from 'socket.io-client';
import api from './api';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { MapPin } from 'lucide-react';

import NavBar from './components/NavBar';
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

function FootprintPopupContent({ fp }) {
  return (
    <div className="min-w-[200px] text-sm">
      <div className="flex items-center gap-2 mb-2">
        {fp.userId?.avatarUrl ? (
          <img src={fp.userId.avatarUrl} className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
            {fp.userId?.name?.[0] || '?'}
          </div>
        )}
        <span className="font-semibold">{fp.userId?.name || 'Unknown'}</span>
      </div>
      <p className="text-gray-500 mb-1">📍 {fp.placeName || 'Unknown location'}</p>
      <p className="text-gray-700 mb-2 whitespace-pre-wrap">{fp.message}</p>
      {fp.photoUrl && (
        <img src={fp.photoUrl} className="w-full max-h-[180px] object-cover rounded-lg mt-2" />
      )}
    </div>
  );
}

function UserSetup({ onDone }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const { data } = await api.post('/api/users/register', { name: name.trim() });
    localStorage.setItem('bliver_user', JSON.stringify(data.user));
    onDone(data.user);
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-2xl p-8 w-[340px] max-w-[90vw]">
        <div className="flex items-center justify-center mb-6">
          <MapPin className="w-10 h-10 text-blue-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-800 text-center mb-2">Welcome to Bliver</h1>
        <p className="text-sm text-gray-400 text-center mb-5">Enter your name to get started</p>
        <input
          autoFocus
          className="w-full p-3 border border-gray-200 rounded-xl text-sm mb-4
            focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold
            hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? '...' : 'Enter'}
        </button>
      </form>
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
    const saved = localStorage.getItem('bliver_user');
    if (saved) {
      setUser(JSON.parse(saved));
    }
  }, []);

  // Fetch footprints & connect Socket when user is ready
  useEffect(() => {
    if (!user) return;

    api.get('/api/footprints/today').then((res) => {
      setFootprints(res.data.footprints);
    });

    const socket = io(SOCKET_URL);
    socket.emit('user:online', user._id);

    socket.on('online:count', (data) => {
      setOnlineCount(data.count);
    });

    socket.on('footprint:new', (data) => {
      setFootprints((prev) => [data.footprint, ...prev]);
    });

    return () => { socket.disconnect(); };
  }, [user]);

  if (!user) return <UserSetup onDone={setUser} />;

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Top Nav */}
      <NavBar onlineCount={onlineCount} />

      {/* Map */}
      <MapContainer center={CENTER} zoom={6} scrollWheelZoom className="w-full h-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RecenterOnLoad footprints={footprints} />
        {footprints.map((fp) => (
          <Marker key={fp._id} position={[fp.location.lat, fp.location.lng]}>
            <Popup>
              <FootprintPopupContent fp={fp} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Bottom floating check-in button */}
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

      {/* Sidebar toggle */}
      <button
        onClick={() => setShowTimeline(true)}
        className="absolute top-20 right-3 z-[1000] px-4 py-2 bg-white/80 backdrop-blur rounded-xl
          text-sm font-medium text-gray-700 shadow-md border border-gray-200/60
          hover:bg-white transition-colors"
      >
        Today&apos;s Journey →
      </button>

      {/* Modal */}
      <CheckInModal
        isOpen={showCheckIn}
        onClose={() => setShowCheckIn(false)}
        userId={user._id}
      />

      {/* Timeline Drawer */}
      <TimelineDrawer
        isOpen={showTimeline}
        onClose={() => setShowTimeline(false)}
        footprints={footprints}
      />
    </div>
  );
}
