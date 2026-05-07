import { useState, useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import '@joergdietrich/leaflet.terminator';
import { Sun, Cloud, CloudRain, Thermometer } from 'lucide-react';

const OWM_KEY = import.meta.env.VITE_OWM_API_KEY || '';

function TerminatorLayer({ visible }) {
  const map = useMap();

  useEffect(() => {
    if (!visible) return;

    const terminator = L.terminator();
    terminator.addTo(map);

    const interval = setInterval(() => {
      terminator.setTime();
    }, 60000); // update every minute

    return () => {
      map.removeLayer(terminator);
      clearInterval(interval);
    };
  }, [map, visible]);

  return null;
}

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
      opacity: 0.6,
      maxZoom: 10,
    });
    layer.addTo(map);

    return () => {
      map.removeLayer(layer);
    };
  }, [map, visible, type]);

  return null;
}

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
      // Turn off other weather layers when turning a new one on
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

      {/* Toggle panel */}
      <div className="absolute top-20 left-3 z-[1000] flex flex-col gap-1">
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
