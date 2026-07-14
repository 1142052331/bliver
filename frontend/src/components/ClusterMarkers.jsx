import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import useUIStore from '../store/useUIStore';

export const CLUSTER_EXPANSION_ZOOM = 17;

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

function readBoundsCorner(bounds, getter, property) {
  const corner = bounds?.[getter]?.() || bounds?.[property];
  if (!Number.isFinite(corner?.lat) || !Number.isFinite(corner?.lng)) return null;
  return [corner.lat, corner.lng];
}

export function buildClusterPayload(markers = [], bounds) {
  const descriptor = buildClusterDescriptor(markers);
  const southWest = readBoundsCorner(bounds, 'getSouthWest', '_southWest');
  const northEast = readBoundsCorner(bounds, 'getNorthEast', '_northEast');
  return {
    footprintIds: markers.map((marker) => marker._footprintId).filter(Boolean),
    bounds: southWest && northEast ? [southWest, northEast] : null,
    placeCount: descriptor.placeCount,
    footprintCount: descriptor.footprintCount,
  };
}

export function handleClusterClick({ layer, openCluster }) {
  const childMarkers = layer.getAllChildMarkers();
  openCluster(buildClusterPayload(childMarkers, layer.getBounds()));
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
      disableClusteringAtZoom: CLUSTER_EXPANSION_ZOOM,
      iconCreateFunction: makeClusterIcon,
    });

    group.on('clusterclick', (event) => {
      handleClusterClick({
        layer: event.layer,
        openCluster: useUIStore.getState().openCluster,
      });
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
