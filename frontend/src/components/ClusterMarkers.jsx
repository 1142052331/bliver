import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

function buildPopupHtml(fp, userId, isAdmin) {
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
        <span style="${likedClass};font-size:16px;cursor:pointer">${liked ? '❤️' : '🤍'}</span>
        ${likeCount > 0 ? `<span style="font-size:12px;color:#6b7280">${likeCount} — ${likeNames}</span>` : ''}
      </div>
    </div>
  `;
}

function buildClusterHtml(footprints) {
  const items = footprints.slice(0, 6).map((fp) => {
    const name = fp.userId?.name || '?';
    const time = new Date(fp.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const msg = (fp.message || '').replace(/🌤.*?— /, '').slice(0, 40);
    return `<div style="padding:4px 0;border-bottom:1px solid #f3f4f6;font-size:12px">
      <strong>${name}</strong> <span style="color:#9ca3af">${time}</span>
      <br/><span style="color:#6b7280">📍 ${fp.placeName || '?'}</span>
      ${msg ? `<br/><span style="color:#374151">${msg}${fp.message.length > 40 ? '...' : ''}</span>` : ''}
    </div>`;
  }).join('');

  const more = footprints.length > 6 ? `<p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:4px">+${footprints.length - 6} more</p>` : '';

  return `<div style="font-size:13px;font-family:system-ui,sans-serif">
    <strong style="font-size:14px">${footprints.length} footprints here</strong>
    <div style="max-height:280px;overflow-y:auto;margin-top:4px">${items}${more}</div>
    <p style="font-size:11px;color:#9ca3af;margin-top:6px">Zoom in to see each one</p>
  </div>`;
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
      zoomToBoundsOnClick: false, // We handle click ourselves
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

    // Handle cluster click
    cg.off('clusterclick');
    cg.on('clusterclick', (e) => {
      const clusterMarkers = e.layer.getAllChildMarkers();
      const ids = clusterMarkers.map((m) => m._footprintId);
      const clustered = footprints.filter((fp) => ids.includes(fp._id));

      const popup = L.popup()
        .setLatLng(e.latlng)
        .setContent(buildClusterHtml(clustered))
        .openOn(map);
    });

    footprints.forEach((fp) => {
      if (!fp.location?.lat || !fp.location?.lng) return;

      const marker = L.marker([fp.location.lat, fp.location.lng], {
        title: fp.userId?.name,
      });

      marker._footprintId = fp._id;

      marker.bindPopup(buildPopupHtml(fp, userId, isAdmin), {
        maxWidth: 280,
        className: 'footprint-popup',
      });

      // Add event listeners for the popup buttons after it opens
      marker.on('popupopen', () => {
        setTimeout(() => {
          const popupEl = document.querySelector('.footprint-popup');
          if (!popupEl) return;
          // Like button
          popupEl.querySelector('.popup-like')?.addEventListener('click', () => {
            const event = new CustomEvent('footprint:like', { detail: fp._id });
            window.dispatchEvent(event);
          });
          // Delete button
          popupEl.querySelector('.popup-delete')?.addEventListener('click', () => {
            const event = new CustomEvent('footprint:delete', { detail: fp._id });
            window.dispatchEvent(event);
          });
          // Share button
          popupEl.querySelector('.popup-share')?.addEventListener('click', () => {
            const event = new CustomEvent('footprint:share', { detail: fp._id });
            window.dispatchEvent(event);
          });
        }, 50);
      });

      cg.addLayer(marker);
    });
  }, [footprints, userId, isAdmin, map]);

  return null;
}
