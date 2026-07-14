import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import useUIStore from '../store/useUIStore';

const iconCache = new Map();
const SOURCE_PRIORITY = ['self', 'friend', 'region', 'country', 'global'];
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

export function shouldOpenSamePlace({ zoom, maxZoom, childLatLngs }) {
  if (!childLatLngs || childLatLngs.length < 2) return false;
  const latitudes = childLatLngs.map((point) => point.lat);
  const longitudes = childLatLngs.map((point) => point.lng);
  const effectivelyIdentical = Math.max(...latitudes) - Math.min(...latitudes) <= 0.000001
    && Math.max(...longitudes) - Math.min(...longitudes) <= 0.000001;
  return effectivelyIdentical || zoom >= maxZoom - 1;
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

function clusterCoordinateKey(point) {
  return `${point.lat.toFixed(6)}:${point.lng.toFixed(6)}`;
}

export function buildClusterDescriptor(markers = []) {
  const places = new Set();
  const sourceCounts = new Map();
  let hasUnread = false;

  markers.forEach((marker) => {
    const point = marker.getLatLng?.();
    if (Number.isFinite(point?.lat) && Number.isFinite(point?.lng)) {
      places.add(clusterCoordinateKey(point));
    }
    const source = SOURCE_PRIORITY.includes(marker._sourceScope) ? marker._sourceScope : 'global';
    sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
    hasUnread ||= Boolean(marker._isUnread);
  });

  const sourceScopes = [...sourceCounts]
    .sort(([left, leftCount], [right, rightCount]) => (
      rightCount - leftCount
      || SOURCE_PRIORITY.indexOf(left) - SOURCE_PRIORITY.indexOf(right)
    ))
    .slice(0, 3)
    .map(([source]) => source);
  const placeCount = places.size;
  const footprintCount = markers.length;
  return {
    placeCount,
    footprintCount,
    sourceScopes,
    hasUnread,
    label: `${placeCount} 个地点`,
    accessibleLabel: `${placeCount} 个地点，${footprintCount} 条足迹${hasUnread ? '，包含未读更新' : ''}`,
  };
}

export function clusterCacheKey(descriptor) {
  return [
    descriptor.placeCount,
    descriptor.footprintCount,
    descriptor.sourceScopes.join(','),
    descriptor.hasUnread ? 'unread' : 'read',
  ].join(':');
}

export function buildClusterHtml(descriptor) {
  const sourceScopes = Array.from({ length: 3 }, (_, index) => (
    descriptor.sourceScopes[index] || descriptor.sourceScopes.at(-1) || 'global'
  ));
  const pins = sourceScopes.map((source, index) => (
    `<i class="bliver-map-cluster__pin bliver-map-cluster__pin--${source} bliver-map-cluster__pin--${index + 1}"></i>`
  )).join('');

  return `<div class="bliver-map-cluster${descriptor.hasUnread ? ' bliver-map-cluster--unread' : ''}" role="button" aria-label="${escapeHtml(descriptor.accessibleLabel)}">
    <span class="bliver-map-cluster__stack" aria-hidden="true">${pins}</span>
    <span class="bliver-map-cluster__label">${escapeHtml(descriptor.label)}</span>
    ${descriptor.hasUnread ? '<span class="bliver-map-cluster__dot" aria-hidden="true"></span>' : ''}
  </div>`;
}

function makeClusterIcon(cluster) {
  const descriptor = buildClusterDescriptor(cluster.getAllChildMarkers());

  return cachedIcon(clusterCacheKey(descriptor), () => L.divIcon({
    html: buildClusterHtml(descriptor),
    className: 'bliver-map-cluster-icon',
    iconSize: [112, 82],
    iconAnchor: [56, 40],
  }));
}

export default function ClusterMarkers({
  footprints,
  pulseIds = new Set(),
  selectedId = null,
  onPulseComplete = () => {},
}) {
  const map = useMap();
  const clusterGroup = useRef(null);
  const pulseTimers = useRef(new Set());

  useEffect(() => {
    const timers = pulseTimers.current;
    const group = L.markerClusterGroup({
      maxClusterRadius: 56,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: false,
      iconCreateFunction: makeClusterIcon,
    });

    group.on('clusterclick', (event) => {
      const childMarkers = event.layer.getAllChildMarkers();
      const markerIds = childMarkers.map((marker) => marker._footprintId);
      const childLatLngs = childMarkers.map((marker) => marker.getLatLng());
      const mapMaxZoom = map.getMaxZoom();
      const maxZoom = Math.min(Number.isFinite(mapMaxZoom) ? mapMaxZoom : 18, 18);
      if (shouldOpenSamePlace({ zoom: map.getZoom(), maxZoom, childLatLngs })) {
        useUIStore.getState().openSamePlace(markerIds);
      } else {
        map.fitBounds(event.layer.getBounds(), {
          padding: [48, 96],
          maxZoom: Math.min(maxZoom, map.getZoom() + 2),
        });
      }
    });

    clusterGroup.current = group;
    map.addLayer(group);
    return () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
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
