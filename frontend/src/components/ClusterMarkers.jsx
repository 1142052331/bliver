import { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { getReadMap, isUnread, seedReadMap } from '../readStatus';
import useUIStore from '../store/useUIStore';

const iconCache = new Map();

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

function createFootprintIcon(mood, unread) {
  const safeMood = escapeHtml(mood || '📍');
  return L.divIcon({
    html: `<div class="bliver-map-marker${unread ? ' bliver-map-marker--unread' : ''}">
      <span class="bliver-map-marker__mood">${safeMood}</span>
      <span class="bliver-map-marker__pin"></span>
      ${unread ? '<span class="bliver-map-marker__dot"></span>' : ''}
    </div>`,
    className: 'bliver-map-marker-icon',
    iconSize: [48, 58],
    iconAnchor: [24, 54],
  });
}

function pickIcon(footprint, unread) {
  const key = `${unread ? 'unread' : 'read'}:${footprint.mood || 'pin'}`;
  return cachedIcon(key, () => createFootprintIcon(footprint.mood, unread));
}

function makeClusterIcon(cluster) {
  const count = cluster.getChildCount();
  const hasUnread = cluster.getAllChildMarkers().some((marker) => marker._isUnread);

  return L.divIcon({
    html: `<div class="bliver-map-cluster${hasUnread ? ' bliver-map-cluster--unread' : ''}"><span>${count}</span>${hasUnread ? '<i></i>' : ''}</div>`,
    className: 'bliver-map-cluster-icon',
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });
}

export default function ClusterMarkers({ footprints, userId }) {
  const map = useMap();
  const clusterGroup = useRef(null);
  const footprintsRef = useRef(footprints);
  const [readVersion, setReadVersion] = useState(0);
  footprintsRef.current = footprints;

  useEffect(() => useUIStore.subscribe(
    (state) => state.markReadVersion,
    () => setReadVersion((version) => version + 1),
  ), []);

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
      map.removeLayer(group);
      clusterGroup.current = null;
    };
  }, [map]);

  useEffect(() => {
    const group = clusterGroup.current;
    if (!group) return;

    group.clearLayers();
    const readMap = seedReadMap(footprints.map((footprint) => footprint._id), footprints, userId);

    footprints.forEach((footprint) => {
      const { lat, lng } = footprint.location || {};
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const unread = isUnread(footprint, readMap);
      const marker = L.marker([lat, lng], {
        title: footprint.userId?.name || '足迹',
        icon: pickIcon(footprint, unread),
      });

      marker._footprintId = footprint._id;
      marker._isUnread = unread;
      marker.on('click', () => useUIStore.getState().setMapPreviewId(footprint._id));
      group.addLayer(marker);
    });
  }, [footprints, userId, readVersion]);

  return null;
}
