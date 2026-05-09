import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

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

/**
 * 判断足迹是否有新留言（12 小时内、比上次查看时间更新）。
 * readMap 参数从外部传入，避免循环内反复读 localStorage。
 */
function isUnread(fp, readMap) {
  const cutoff = Date.now() - 12 * 60 * 60 * 1000;
  const recent = (fp.comments || []).filter(
    (c) => new Date(c.createdAt).getTime() > cutoff && c.content?.trim()
  );
  if (recent.length === 0) return false;

  const latestTime = Math.max(...recent.map((c) => new Date(c.createdAt).getTime()));
  const readTime = readMap[fp._id] || 0;
  return latestTime > readTime;
}

// ── Icon cache — L.divIcon 构造开销大，按 key 缓存 ────────

const iconCache = new Map();

function cachedIcon(key, factory) {
  if (iconCache.has(key)) return iconCache.get(key);
  const icon = factory();
  iconCache.set(key, icon);
  return icon;
}

function createMoodIcon(mood) {
  return L.divIcon({
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:3px">
      <span class="marker-mood-float" style="font-size:22px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3))">${mood}</span>
      <div style="width:20px;height:20px;background:#2dd4bf;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(45,212,191,0.5)"></div>
    </div>`,
    className: '',
    iconSize: [30, 50],
    iconAnchor: [15, 25],
  });
}

let defaultIcon = null;
function getDefaultIcon() {
  if (!defaultIcon) {
    defaultIcon = L.divIcon({
      html: `<div style="display:flex;flex-direction:column;align-items:center;gap:3px">
        <span class="marker-mood-float" style="font-size:22px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3))">📍</span>
        <div style="width:20px;height:20px;background:#2dd4bf;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(45,212,191,0.5)"></div>
      </div>`,
      className: '',
      iconSize: [30, 50],
      iconAnchor: [15, 25],
    });
  }
  return defaultIcon;
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

function createStreakIcon(mood, streak) {
  const emoji = mood || '📍';
  const badge = streak >= 7 ? '🔥' : streak >= 3 ? '✨' : '';
  return L.divIcon({
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
      <span class="marker-mood-float" style="font-size:${badge ? '16' : '22'}px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3))">${emoji}${badge}</span>
      <div style="width:20px;height:20px;background:#2dd4bf;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fb923c;box-shadow:0 0 12px rgba(251,146,60,0.5),0 2px 8px rgba(45,212,191,0.3)"></div>
    </div>`,
    className: '',
    iconSize: [30, 50],
    iconAnchor: [15, 25],
  });
}

/** 为每个足迹选择最合适的图标（带缓存） */
function pickIcon(fp, streak, unread) {
  if (streak > 0) {
    const key = `streak:${fp.mood || 'none'}:${streak >= 7 ? 'fire' : streak >= 3 ? 'sparkle' : 'none'}`;
    return cachedIcon(key, () => createStreakIcon(fp.mood, streak));
  }
  if (unread) {
    const key = `unread:${fp.mood || 'none'}`;
    return cachedIcon(key, () => createNewCommentIcon(fp.mood));
  }
  if (fp.mood) {
    const key = `mood:${fp.mood}`;
    return cachedIcon(key, () => createMoodIcon(fp.mood));
  }
  return getDefaultIcon();
}

// ── Component ────────────────────────────────────────────

export default function ClusterMarkers({ footprints, userId, isAdmin }) {
  const map = useMap();
  const clusterGroup = useRef(null);
  const footprintsRef = useRef(footprints);
  footprintsRef.current = footprints; // keep clusterclick handler synced
  const [readVersion, setReadVersion] = useState(0);

  const handleMarkRead = useCallback((fpId) => {
    markRead(fpId);
    setReadVersion((v) => v + 1);
  }, []);

  // Inject CSS once (DOM-id guard survives React StrictMode double-mount)
  useEffect(() => {
    const STYLE_ID = 'cluster-markers-style';
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
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
      @keyframes clusterBadgeGlow {
        0%, 100% { box-shadow: 0 0 8px rgba(45,212,191,0.4), 0 0 16px rgba(45,212,191,0.15); }
        50% { box-shadow: 0 0 16px rgba(45,212,191,0.6), 0 0 28px rgba(45,212,191,0.3); }
      }
      .cluster-badge-glow {
        animation: clusterBadgeGlow 2.5s ease-in-out infinite;
      }
      .new-comment-bubble {
        animation: commentGlow 2s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);
  }, []);

  // Initialize cluster group (once, not on every footprints change)
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
        const tier = count < 10 ? 0 : count < 50 ? 1 : 2;
        const pinSizes = [26, 32, 38];
        const badgeSizes = [20, 24, 28];
        const fontSizes = [10, 11, 13];
        const pin = pinSizes[tier];
        const badge = badgeSizes[tier];
        const fs = fontSizes[tier];

        return L.divIcon({
          html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;position:relative;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.2))">
            <span class="cluster-badge-glow" style="
              position:absolute;top:-${badge / 2 + 2}px;right:-${badge * 0.6}px;z-index:2;
              background:#0f172a;color:#2dd4bf;
              min-width:${badge}px;height:${badge}px;padding:0 5px;border-radius:${badge / 2}px;
              display:flex;align-items:center;justify-content:center;
              font-size:${fs}px;font-weight:800;line-height:1;
              border:2px solid #2dd4bf;font-family:system-ui;
            ">${count}</span>
            <div style="width:${pin}px;height:${pin}px;background:#2dd4bf;
              border-radius:50% 50% 50% 0;transform:rotate(-45deg);
              border:3px solid white;
              box-shadow:0 0 14px rgba(45,212,191,0.45),0 2px 8px rgba(0,0,0,0.15);
            "></div>
          </div>`,
          className: '',
          iconSize: [pin + badge, pin + badge],
          iconAnchor: [(pin + badge) / 2, pin + badge * 0.6],
        });
      },
    });

    // clusterclick set once — uses ref to always read latest footprints
    cg.on('clusterclick', (e) => {
      const clusterMarkers = e.layer.getAllChildMarkers();
      const ids = clusterMarkers.map((m) => m._footprintId);
      const latest = footprintsRef.current.filter((fp) => ids.includes(fp._id));
      window.dispatchEvent(new CustomEvent('cluster:click', {
        detail: { footprints: latest },
      }));
    });

    clusterGroup.current = cg;
    map.addLayer(cg);

    return () => {
      map.removeLayer(cg);
      clusterGroup.current = null;
    };
  }, [map]);

  // Update markers when footprints or read state change
  useEffect(() => {
    const cg = clusterGroup.current;
    if (!cg) return;

    cg.clearLayers();

    // Read localStorage once before the loop, not N times inside it
    const readMap = getReadMap();

    footprints.forEach((fp) => {
      if (!fp.location?.lat || !fp.location?.lng) return;

      const unread = isUnread(fp, readMap);
      const streak = fp.userId?.checkinStreak?.current || 0;

      const icon = pickIcon(fp, streak, unread);

      const marker = L.marker([fp.location.lat, fp.location.lng], {
        title: fp.userId?.name,
        icon,
      });

      marker._footprintId = fp._id;

      marker.on('click', () => {
        if (unread) handleMarkRead(fp._id);
        const list = [fp];
        window.dispatchEvent(new CustomEvent('cluster:click', {
          detail: { footprints: list },
        }));
      });

      cg.addLayer(marker);
    });
  }, [footprints, userId, map, readVersion, handleMarkRead]);

  return null;
}
