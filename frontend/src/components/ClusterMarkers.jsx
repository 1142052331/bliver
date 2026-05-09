import { useEffect, useRef, useState, useCallback } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

const MOOD_COLORS = {
  '😊': '#f59e0b',
  '😭': '#9ca3af',
  '😋': '#10b981',
  '🏋️': '#ef4444',
  '😴': '#8b5cf6',
  '🍺': '#d97706',
};

const READ_KEY = 'bliver_read_comments';

function getReadMap() {
  try {
    return JSON.parse(localStorage.getItem(READ_KEY)) || {};
  } catch {
    return {};
  }
}

function markRead(fpId) {
  const map = getReadMap();
  map[fpId] = Date.now();
  localStorage.setItem(READ_KEY, JSON.stringify(map));
}

function isUnread(fp) {
  const cutoff = Date.now() - 12 * 60 * 60 * 1000;
  const recent = (fp.comments || []).filter(
    (c) => new Date(c.createdAt).getTime() > cutoff && c.content?.trim()
  );
  if (recent.length === 0) return false;

  const latestTime = Math.max(...recent.map((c) => new Date(c.createdAt).getTime()));
  const readMap = getReadMap();
  const readTime = readMap[fp._id] || 0;

  return latestTime > readTime;
}

function createMoodIcon(mood) {
  const color = MOOD_COLORS[mood] || '#3b82f6';
  return L.divIcon({
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:3px">
      <span class="marker-mood-float" style="font-size:22px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3))">${mood}</span>
      <div style="width:20px;height:20px;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>
    </div>`,
    className: '',
    iconSize: [30, 50],
    iconAnchor: [15, 25],
  });
}

function createNewCommentIcon(mood) {
  return L.divIcon({
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
      <span class="marker-mood-float" style="font-size:16px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3))">${mood || '💬'}</span>
      <div class="new-comment-bubble" style="
        background:#2dd4bf;color:#0a0a0f;font-size:9px;font-weight:700;
        padding:2px 8px;border-radius:10px;
        white-space:nowrap;line-height:1.4;
      ">新留言</div>
      <div style="width:20px;height:20px;background:#2dd4bf;border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);border:3px solid white;
        box-shadow:0 2px 8px rgba(45,212,191,0.5);"></div>
    </div>`,
    className: '',
    iconSize: [60, 58],
    iconAnchor: [30, 56],
  });
}

export default function ClusterMarkers({ footprints, userId, isAdmin }) {
  const map = useMap();
  const clusterGroup = useRef(null);
  const styleInserted = useRef(false);
  const [readVersion, setReadVersion] = useState(0);

  const handleMarkRead = useCallback((fpId) => {
    markRead(fpId);
    setReadVersion((v) => v + 1);
  }, []);

  // Inject CSS once
  useEffect(() => {
    if (styleInserted.current) return;
    styleInserted.current = true;
    const style = document.createElement('style');
    style.textContent = `
      @keyframes moodFloat {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-5px); }
      }
      .marker-mood-float {
        animation: moodFloat 2.5s ease-in-out infinite;
        display: block !important;
      }
      @keyframes commentGlow {
        0%, 100% { box-shadow: 0 0 12px rgba(45,212,191,0.5), 0 0 24px rgba(45,212,191,0.25); }
        50% { box-shadow: 0 0 20px rgba(45,212,191,0.7), 0 0 36px rgba(45,212,191,0.4); }
      }
      .new-comment-bubble {
        animation: commentGlow 2s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Initialize cluster group
  useEffect(() => {
    if (clusterGroup.current) {
      map.removeLayer(clusterGroup.current);
    }

    const cg = L.markerClusterGroup({
      maxClusterRadius: 60,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: false,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        const size = count < 10 ? 'small' : count < 50 ? 'medium' : 'large';
        const sizes = { small: 32, medium: 40, large: 48 };
        const colors = { small: '#3b82f6', medium: '#2563eb', large: '#1d4ed8' };
        const s = sizes[size];
        return L.divIcon({
          html: `<div style="
            width:${s}px;height:${s}px;
            background:${colors[size]};
            border-radius:50%;
            display:flex;align-items:center;justify-content:center;
            color:white;font-weight:bold;font-size:${s * 0.38}px;
            box-shadow:0 2px 8px rgba(0,0,0,0.3);
            border:3px solid white;
          ">${count}</div>`,
          className: '',
          iconSize: [s, s],
          iconAnchor: [s / 2, s / 2],
        });
      },
    });

    clusterGroup.current = cg;
    map.addLayer(cg);

    return () => {
      map.removeLayer(cg);
      clusterGroup.current = null;
    };
  }, [map]);

  // Helper: open the cluster drawer for given footprints
  const openClusterPanel = (list) => {
    window.dispatchEvent(new CustomEvent('cluster:click', {
      detail: { footprints: list },
    }));
  };

  // Update markers when footprints or read state change
  useEffect(() => {
    const cg = clusterGroup.current;
    if (!cg) return;

    cg.clearLayers();

    cg.off('clusterclick');
    cg.on('clusterclick', (e) => {
      const clusterMarkers = e.layer.getAllChildMarkers();
      const ids = clusterMarkers.map((m) => m._footprintId);
      const clustered = footprints.filter((fp) => ids.includes(fp._id));
      openClusterPanel(clustered);
    });

    footprints.forEach((fp) => {
      if (!fp.location?.lat || !fp.location?.lng) return;

      const unread = isUnread(fp);

      let icon;
      if (unread) {
        icon = createNewCommentIcon(fp.mood);
      } else if (fp.mood) {
        icon = createMoodIcon(fp.mood);
      } else {
        icon = new L.Icon.Default();
      }

      const marker = L.marker([fp.location.lat, fp.location.lng], {
        title: fp.userId?.name,
        icon,
      });

      marker._footprintId = fp._id;

      marker.on('click', () => {
        if (unread) handleMarkRead(fp._id);
        openClusterPanel([fp]);
      });

      cg.addLayer(marker);
    });
  }, [footprints, userId, map, readVersion, handleMarkRead]);

  return null;
}
