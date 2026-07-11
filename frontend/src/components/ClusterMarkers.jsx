import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import useUIStore from '../store/useUIStore';

const iconCache = new Map();
const SOURCE_LABELS = {
  self: '我的', friend: '好友', region: '同省', country: '同国', global: '全球',
};

function cachedIcon(key, factory) {
  if (iconCache.has(key)) return iconCache.get(key);
  const icon = factory();
  iconCache.set(key, icon);
  return icon;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[char]));
}

export function buildMarkerDescriptor(footprint, { pulseIds = new Set(), selectedId = null } = {}) {
  const sourceScope = SOURCE_LABELS[footprint.sourceScope]
    ? footprint.sourceScope
    : footprint.relationship === 'self' || footprint.relationship === 'friend'
      ? footprint.relationship
      : 'global';
  return {
    id: footprint._id,
    mood: footprint.mood || '📍',
    sourceScope,
    label: footprint.sourceLabel || SOURCE_LABELS[sourceScope],
    unread: Boolean(footprint.isUnread),
    selected: selectedId === footprint._id,
    pulse: pulseIds.has(footprint._id),
  };
}

export function markerCacheKey(descriptor) {
  return [
    descriptor.mood,
    descriptor.sourceScope,
    descriptor.unread ? 'unread' : 'read',
    descriptor.selected ? 'selected' : 'idle',
    descriptor.pulse ? 'pulse' : 'still',
  ].join(':');
}

export function buildMarkerHtml(descriptor) {
  const classes = [
    'bliver-map-marker',
    `bliver-map-marker--${descriptor.sourceScope}`,
    descriptor.unread ? 'bliver-map-marker--unread' : '',
    descriptor.selected ? 'bliver-map-marker--selected' : '',
    descriptor.pulse ? 'bliver-map-marker--pulse' : '',
  ].filter(Boolean).join(' ');
  return `<div class="${classes}">
    <span class="bliver-map-marker__mood">${escapeHtml(descriptor.mood)}</span>
    <span class="bliver-map-marker__source">${escapeHtml(descriptor.label)}</span>
    <span class="bliver-map-marker__pin"></span>
    ${descriptor.unread ? '<span class="bliver-map-marker__dot" aria-hidden="true"></span>' : ''}
  </div>`;
}

function createFootprintIcon(descriptor) {
  return L.divIcon({
    html: buildMarkerHtml(descriptor),
    className: 'bliver-map-marker-icon',
    iconSize: [64, 72],
    iconAnchor: [32, 68],
  });
}

function pickIcon(descriptor) {
  return cachedIcon(markerCacheKey(descriptor), () => createFootprintIcon(descriptor));
}

function makeClusterIcon(cluster) {
  const markers = cluster.getAllChildMarkers();
  const count = cluster.getChildCount();
  const hasUnread = markers.some((marker) => marker._isUnread);
  const sources = new Set(markers.map((marker) => marker._sourceScope));
  const source = sources.size === 1 ? [...sources][0] : 'mixed';

  return L.divIcon({
    html: `<div class="bliver-map-cluster bliver-map-cluster--${source}${hasUnread ? ' bliver-map-cluster--unread' : ''}"><span>${count}</span>${hasUnread ? '<i></i>' : ''}</div>`,
    className: 'bliver-map-cluster-icon',
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });
}

export default function ClusterMarkers({
  footprints,
  pulseIds = new Set(),
  selectedId = null,
  onPulseComplete = () => {},
}) {
  const map = useMap();
  const clusterGroup = useRef(null);
  const footprintsRef = useRef(footprints);
  const pulseTimers = useRef(new Set());
  footprintsRef.current = footprints;

  useEffect(() => {
    const group = L.markerClusterGroup({
      maxClusterRadius: 56,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: false,
      iconCreateFunction: makeClusterIcon,
    });

    group.on('clusterclick', (event) => {
      const markerIds = event.layer.getAllChildMarkers().map((marker) => marker._footprintId);
      const selected = footprintsRef.current.filter((footprint) => markerIds.includes(footprint._id));
      useUIStore.getState().setClusterData({ footprints: selected });
    });

    clusterGroup.current = group;
    map.addLayer(group);
    return () => {
      for (const timer of pulseTimers.current) clearTimeout(timer);
      pulseTimers.current.clear();
      map.removeLayer(group);
      clusterGroup.current = null;
    };
  }, [map]);

  useEffect(() => {
    const group = clusterGroup.current;
    if (!group) return;

    group.clearLayers();
    footprints.forEach((footprint) => {
      const { lat, lng } = footprint.location || {};
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const descriptor = buildMarkerDescriptor(footprint, { pulseIds, selectedId });
      const marker = L.marker([lat, lng], {
        title: `${footprint.userId?.name || '足迹'} · ${descriptor.label}`,
        icon: pickIcon(descriptor),
      });

      marker._footprintId = footprint._id;
      marker._isUnread = descriptor.unread;
      marker._sourceScope = descriptor.sourceScope;
      marker.on('click', () => useUIStore.getState().setMapPreviewId(footprint._id));
      if (descriptor.pulse) {
        marker.once('add', () => {
          let finished = false;
          const finish = () => {
            if (finished) return;
            finished = true;
            onPulseComplete(footprint._id);
          };
          marker.getElement()?.querySelector('.bliver-map-marker')
            ?.addEventListener('animationend', finish, { once: true });
          const timer = setTimeout(() => {
            pulseTimers.current.delete(timer);
            finish();
          }, 900);
          pulseTimers.current.add(timer);
        });
      }
      group.addLayer(marker);
    });
  }, [footprints, onPulseComplete, pulseIds, selectedId]);

  return null;
}
