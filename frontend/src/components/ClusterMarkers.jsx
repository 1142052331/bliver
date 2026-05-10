import { useEffect, useRef, useState, useCallback } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { getReadMap, isUnread, seedReadMap } from '../readStatus';

// ── Icon cache ────────────────────────────────────────────

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
    html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:3px">
      <span class="marker-mood-float" style="font-size:16px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3))">${mood || '💬'}</span>
      <div class="new-msg-bubble" style="
        background:rgba(15,23,32,0.88);backdrop-filter:blur(12px);
        -webkit-backdrop-filter:blur(12px);
        color:#22d3ee;font-size:10px;font-weight:700;
        padding:2px 10px;border-radius:12px;
        white-space:nowrap;line-height:1.5;
        border:1px solid rgba(34,211,238,0.25);
        box-shadow:0 2px 10px rgba(0,0,0,0.35);
      ">新消息</div>
      <div style="position:relative;width:20px;height:20px">
        <div class="new-msg-ring" style="
          position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
          width:14px;height:14px;border-radius:50%;
          border:2px solid #22d3ee;background:transparent;
        "></div>
        <div class="new-msg-ring" style="
          position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
          width:14px;height:14px;border-radius:50%;
          border:2px solid #22d3ee;background:transparent;
          animation-delay:0.4s;
        "></div>
        <div class="new-msg-pin" style="width:20px;height:20px;background:#22d3ee;border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);border:3px solid white;
          box-shadow:0 0 16px rgba(34,211,238,0.6),0 2px 8px rgba(0,0,0,0.15);"></div>
      </div>
    </div>`,
    className: '',
    iconSize: [60, 60],
    iconAnchor: [30, 58],
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

function pickIcon(fp, streak, unread) {
  // unread takes highest priority — override streak/mood icons
  if (unread) {
    const key = `unread:${fp.mood || 'none'}`;
    return cachedIcon(key, () => createNewCommentIcon(fp.mood));
  }
  if (streak > 0) {
    const key = `streak:${fp.mood || 'none'}:${streak >= 7 ? 'fire' : streak >= 3 ? 'sparkle' : 'none'}`;
    return cachedIcon(key, () => createStreakIcon(fp.mood, streak));
  }
  if (fp.mood) {
    const key = `mood:${fp.mood}`;
    return cachedIcon(key, () => createMoodIcon(fp.mood));
  }
  return getDefaultIcon();
}

// ── Cluster icon with optional unread indicator ───────────

function makeClusterIcon(cluster) {
  const count = cluster.getChildCount();
  const children = cluster.getAllChildMarkers();
  const hasUnread = children.some((m) => m._isUnread);

  const tier = count < 10 ? 0 : count < 50 ? 1 : 2;
  const pinSizes = [26, 32, 38];
  const badgeSizes = [20, 24, 28];
  const fontSizes = [10, 11, 13];
  const pin = pinSizes[tier];
  const badge = badgeSizes[tier];
  const fs = fontSizes[tier];

  const pinColor = hasUnread ? '#22d3ee' : '#2dd4bf';

  return L.divIcon({
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;position:relative;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.2))">
      ${hasUnread ? `<span class="cluster-unread-badge" style="
        position:absolute;top:-${badge / 2}px;left:-${badge * 0.35}px;z-index:3;
        background:rgba(15,23,32,0.92);color:#22d3ee;
        min-width:${badge * 1.1}px;height:${badge}px;padding:0 5px;border-radius:${badge / 2}px;
        display:flex;align-items:center;justify-content:center;
        font-size:${fs - 1}px;font-weight:800;line-height:1;
        border:1.5px solid rgba(34,211,238,0.35);
        backdrop-filter:blur(8px);
        -webkit-backdrop-filter:blur(8px);
        font-family:system-ui;
        white-space:nowrap;
      ">新消息</span>` : ''}
      <span class="${hasUnread ? 'cluster-unread-badge' : 'cluster-badge-glow'}" style="
        position:absolute;top:-${badge / 2 + 2}px;right:-${badge * 0.6}px;z-index:2;
        background:#0f172a;color:${pinColor};
        min-width:${badge}px;height:${badge}px;padding:0 5px;border-radius:${badge / 2}px;
        display:flex;align-items:center;justify-content:center;
        font-size:${fs}px;font-weight:800;line-height:1;
        border:2px solid ${pinColor};font-family:system-ui;
      ">${count}</span>
      <div class="${hasUnread ? 'cluster-pin-unread' : ''}" style="width:${pin}px;height:${pin}px;background:${pinColor};
        border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        border:3px solid white;
        box-shadow:0 0 ${hasUnread ? '20' : '14'}px rgba(${hasUnread ? '34,211,238' : '45,212,191'},${hasUnread ? '0.7' : '0.45'}),0 2px 8px rgba(0,0,0,0.15);
      "></div>
    </div>`,
    className: '',
    iconSize: [pin + badge * 2 + 8, pin + badge + 6],
    iconAnchor: [(pin + badge * 2 + 8) / 2, pin + badge + 4],
  });
}

// ── Component ────────────────────────────────────────────

export default function ClusterMarkers({ footprints, userId, isAdmin }) {
  const map = useMap();
  const clusterGroup = useRef(null);
  const footprintsRef = useRef(footprints);
  footprintsRef.current = footprints;
  const [readVersion, setReadVersion] = useState(0);

  // Listen for external mark-read triggers (e.g. from detail panel)
  useEffect(() => {
    const handler = () => {
      console.log('[ClusterMarkers] footprint:markRead received, incrementing readVersion');
      setReadVersion((v) => v + 1);
    };
    window.addEventListener('footprint:markRead', handler);
    return () => window.removeEventListener('footprint:markRead', handler);
  }, []);

  // Inject CSS once
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
      /* ── Single marker: new-message ring diffusion ──── */
      @keyframes newMsgRingPulse {
        0%   { transform: translate(-50%,-50%) scale(0.8); opacity:0.9; }
        100% { transform: translate(-50%,-50%) scale(3.2); opacity:0; }
      }
      @keyframes newMsgPinPulse {
        0%, 100% { box-shadow: 0 0 14px rgba(34,211,238,0.55), 0 2px 8px rgba(0,0,0,0.15); }
        50%      { box-shadow: 0 0 30px rgba(34,211,238,0.85), 0 0 44px rgba(34,211,238,0.25), 0 2px 8px rgba(0,0,0,0.15); }
      }
      @keyframes newMsgBubblePulse {
        0%, 100% { box-shadow: 0 2px 10px rgba(0,0,0,0.35); }
        50%      { box-shadow: 0 2px 18px rgba(34,211,238,0.3), 0 2px 8px rgba(0,0,0,0.15); }
      }
      .new-msg-ring {
        animation: newMsgRingPulse 0.75s cubic-bezier(0, 0.2, 0.4, 1) infinite;
      }
      .new-msg-pin {
        animation: newMsgPinPulse 1.5s ease-in-out infinite;
      }
      .new-msg-bubble {
        animation: newMsgBubblePulse 2s ease-in-out infinite;
      }
      /* ── Cluster marker unread ──────────────────────── */
      @keyframes clusterUnreadBadge {
        0%, 100% { box-shadow: 0 0 6px rgba(34,211,238,0.35); }
        50%      { box-shadow: 0 0 14px rgba(34,211,238,0.6); }
      }
      @keyframes clusterPinUnread {
        0%, 100% { box-shadow: 0 0 16px rgba(34,211,238,0.6), 0 2px 8px rgba(0,0,0,0.15); }
        50%      { box-shadow: 0 0 26px rgba(34,211,238,0.8), 0 2px 8px rgba(0,0,0,0.15); }
      }
      .cluster-unread-badge {
        animation: clusterUnreadBadge 2s ease-in-out infinite;
      }
      .cluster-pin-unread {
        animation: clusterPinUnread 1.5s ease-in-out infinite;
      }
      @keyframes clusterBadgeGlow {
        0%, 100% { box-shadow: 0 0 8px rgba(45,212,191,0.4), 0 0 16px rgba(45,212,191,0.15); }
        50% { box-shadow: 0 0 16px rgba(45,212,191,0.6), 0 0 28px rgba(45,212,191,0.3); }
      }
      .cluster-badge-glow {
        animation: clusterBadgeGlow 2.5s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);
    return () => { style.remove(); };
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
      iconCreateFunction: makeClusterIcon,
    });

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

    // 首次访问初始化：避免所有带评论的足迹同时显示「新消息」
    const fpIds = footprints.map((f) => f._id);
    const readMap = seedReadMap(fpIds);
    const unreadCount = footprints.filter((fp) => isUnread(fp, readMap)).length;
    console.log('[ClusterMarkers] markers update: footprints=', footprints.length,
      'readMapKeys=', Object.keys(readMap).length,
      'unreadMarkers=', unreadCount);

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
      marker._isUnread = unread;

      marker.on('click', () => {
        // 不在此处 markRead — 让详情面板在用户真正阅读后触发
        const list = [fp];
        window.dispatchEvent(new CustomEvent('cluster:click', {
          detail: { footprints: list },
        }));
      });

      cg.addLayer(marker);
    });
  }, [footprints, userId, map, readVersion]);

  return null;
}
