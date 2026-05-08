import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

function buildPopupHtml(fp, userId) {
  const liked = fp.likes?.some((l) => (l._id || l) === userId);
  const likeCount = fp.likes?.length || 0;
  const likeNames = fp.likes?.map((l) => l.name || '?').join(', ') || '';
  const avatarHtml = fp.userId?.avatarUrl
    ? `<img src="${fp.userId.avatarUrl}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;margin-right:8px;vertical-align:middle" />`
    : `<span style="display:inline-block;width:32px;height:32px;border-radius:50%;background:#3b82f6;color:#fff;text-align:center;line-height:32px;font-size:14px;font-weight:bold;margin-right:8px;vertical-align:middle">${(fp.userId?.name?.[0] || '?').toUpperCase()}</span>`;

  const timeStr = new Date(fp.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const photoHtml = fp.photoUrl
    ? `<img src="${fp.photoUrl}" style="width:100%;max-height:160px;object-fit:cover;border-radius:8px;margin-top:8px" />`
    : '';

  const likedClass = liked ? 'color:#ef4444' : 'color:#9ca3af';

  return `
    <div style="min-width:240px;font-size:14px;font-family:system-ui,sans-serif">
      <div style="display:flex;align-items:center;margin-bottom:4px">
        ${avatarHtml}
        <div>
          <strong>${fp.userId?.name || 'Unknown'}</strong>
          <span style="font-size:11px;color:#9ca3af;margin-left:6px">${timeStr}</span>
        </div>
      </div>
      <p style="color:#6b7280;margin:2px 0;font-size:13px">📍 ${fp.placeName || 'Unknown'}</p>
      <p style="color:#1f2937;margin:6px 0;white-space:pre-wrap;font-size:15px;line-height:1.5">${fp.message}</p>
      ${photoHtml}
      <div style="display:flex;align-items:center;gap:4px;margin-top:8px;padding-top:6px;border-top:1px solid #f3f4f6">
        <span class="popup-like" style="${likedClass};font-size:16px;cursor:pointer">${liked ? '❤️' : '🤍'}</span>
        ${likeCount > 0 ? `<span style="font-size:12px;color:#6b7280">${likeCount} — ${likeNames}</span>` : ''}
      </div>
    </div>
  `;
}

export default function ClusterMarkers({ footprints, userId, isAdmin }) {
  const map = useMap();
  const clusterGroup = useRef(null);

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

  // Update markers when footprints change
  useEffect(() => {
    const cg = clusterGroup.current;
    if (!cg) return;

    cg.clearLayers();

    // Handle cluster click — dispatch custom event for the drawer
    cg.off('clusterclick');
    cg.on('clusterclick', (e) => {
      const clusterMarkers = e.layer.getAllChildMarkers();
      const ids = clusterMarkers.map((m) => m._footprintId);
      const clustered = footprints.filter((fp) => ids.includes(fp._id));

      window.dispatchEvent(new CustomEvent('cluster:click', {
        detail: { footprints: clustered },
      }));
    });

    footprints.forEach((fp) => {
      if (!fp.location?.lat || !fp.location?.lng) return;

      const marker = L.marker([fp.location.lat, fp.location.lng], {
        title: fp.userId?.name,
      });

      marker._footprintId = fp._id;

      marker.bindPopup(buildPopupHtml(fp, userId), {
        maxWidth: 280,
        className: 'footprint-popup',
      });

      // Attach popup like button handler
      marker.on('popupopen', () => {
        setTimeout(() => {
          const popupEl = document.querySelector('.footprint-popup');
          if (!popupEl) return;
          popupEl.querySelector('.popup-like')?.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('footprint:like', { detail: fp._id }));
          });
        }, 50);
      });

      cg.addLayer(marker);
    });
  }, [footprints, userId, map]);

  return null;
}
