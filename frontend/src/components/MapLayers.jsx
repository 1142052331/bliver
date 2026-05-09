import { useState, useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { Sun, Cloud, CloudRain, Thermometer } from 'lucide-react';

const OWM_KEY = import.meta.env.VITE_OWM_API_KEY || '';

// ── Terminator calculation ───────────────────────────────

function getTerminatorLine() {
  const now = new Date();
  const jd = (now.getTime() / 86400000) + 2440587.5;
  const n = jd - 2451545.0;

  const Lsun = (280.466 + 0.9856474 * n) % 360;
  const g = (357.528 + 0.9856003 * n) % 360;
  const lambda = Lsun + 1.915 * Math.sin(g * Math.PI / 180) + 0.02 * Math.sin(2 * g * Math.PI / 180);
  const epsilon = 23.439 - 0.0000004 * n;

  const ra = Math.atan2(
    Math.cos(epsilon * Math.PI / 180) * Math.sin(lambda * Math.PI / 180),
    Math.cos(lambda * Math.PI / 180)
  );
  const dec = Math.asin(Math.sin(epsilon * Math.PI / 180) * Math.sin(lambda * Math.PI / 180));

  // Generate terminator polygon
  const points = [];
  for (let i = 0; i <= 360; i += 2) {
    const lng = i - 180; // -180 to 180
    const lat = Math.atan(-Math.cos((lng - ra * 180 / Math.PI) * Math.PI / 180) / Math.tan(dec)) * 180 / Math.PI;
    if (!isNaN(lat) && lat >= -90 && lat <= 90) {
      points.push([lat, lng]);
    }
  }
  return points;
}

function TerminatorLayer({ visible }) {
  const map = useMap();

  useEffect(() => {
    if (!visible) return;

    let polygon;

    const update = () => {
      const pts = getTerminatorLine();

      if (polygon) map.removeLayer(polygon);

      polygon = L.polyline(pts, {
        color: '#f59e0b',
        weight: 2,
        opacity: 0.8,
        dashArray: '6, 4',
      }).addTo(map);
    };

    update();
    const interval = setInterval(update, 60000);

    return () => {
      if (polygon) map.removeLayer(polygon);
      clearInterval(interval);
    };
  }, [map, visible]);

  return null;
}

// ── Weather tiles ────────────────────────────────────────

function WeatherTile({ visible, type }) {
  const map = useMap();

  useEffect(() => {
    if (!visible || !OWM_KEY) return;

    const urls = {
      clouds: 'https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=' + OWM_KEY,
      precipitation: 'https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=' + OWM_KEY,
      temp: 'https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=' + OWM_KEY,
    };

    const layer = L.tileLayer(urls[type], {
      opacity: 0.85,
      maxZoom: 10,
    });
    layer.addTo(map);

    return () => { map.removeLayer(layer); };
  }, [map, visible, type]);

  return null;
}

// ── Toggle panel ─────────────────────────────────────────

const layers = [
  { key: 'terminator', label: 'Day/Night', icon: Sun },
  { key: 'clouds', label: 'Clouds', icon: Cloud },
  { key: 'precipitation', label: 'Rain', icon: CloudRain },
  { key: 'temp', label: 'Temp', icon: Thermometer },
];

export default function MapLayers() {
  const [active, setActive] = useState({
    terminator: false,
    clouds: false,
    precipitation: false,
    temp: false,
  });

  const toggle = (key) => {
    setActive((prev) => {
      const weatherKeys = ['clouds', 'precipitation', 'temp'];
      const next = { ...prev, [key]: !prev[key] };
      if (weatherKeys.includes(key) && next[key]) {
        weatherKeys.forEach((k) => { if (k !== key) next[k] = false; });
      }
      return next;
    });
  };

  return (
    <>
      <TerminatorLayer visible={active.terminator} />
      <WeatherTile visible={active.clouds} type="clouds" />
      <WeatherTile visible={active.precipitation} type="precipitation" />
      <WeatherTile visible={active.temp} type="temp" />

      <div className="absolute top-20 z-[1000] flex flex-col gap-1"
        style={{ left: `max(12px, env(safe-area-inset-left))` }}>
        {layers.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => toggle(key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium shadow-md
              transition-all duration-200 border
              ${active[key]
                ? 'bg-blue-600 text-white border-blue-600 shadow-blue-600/30'
                : 'bg-white/80 backdrop-blur text-gray-600 border-gray-200 hover:bg-white'
              }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
