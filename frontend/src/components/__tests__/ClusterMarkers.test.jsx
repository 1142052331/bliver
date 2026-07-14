import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('leaflet.markercluster', () => ({}));
const mocks = vi.hoisted(() => ({
  group: {
    on: vi.fn(),
    clearLayers: vi.fn(),
  },
  map: {
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
  },
}));
vi.mock('leaflet', () => ({
  default: {
    divIcon: vi.fn((options) => options),
    markerClusterGroup: vi.fn(() => mocks.group),
    marker: vi.fn(),
  },
}));
vi.mock('react-leaflet', () => ({ useMap: () => mocks.map }));

import {
  buildMarkerDescriptor,
  buildMarkerHtml,
  markerCacheKey,
  buildClusterDescriptor,
  buildClusterHtml,
  clusterCacheKey,
  handleClusterClick,
} from '../ClusterMarkers';
import ClusterMarkers from '../ClusterMarkers';
import L from 'leaflet';

function marker({ id, lat, lng, source, unread }) {
  return {
    _footprintId: id,
    _sourceScope: source,
    _isUnread: unread,
    getLatLng: () => ({ lat, lng }),
  };
}

const footprint = {
  _id: 'fp-1',
  mood: '🙂',
  sourceScope: 'region',
  sourceLabel: '同省',
  relationship: 'stranger',
  isUnread: false,
  userId: { name: '旅人', checkinStreak: { current: 99 } },
};

describe('map marker descriptors', () => {
  it.each([
    ['self', '我的'],
    ['friend', '好友'],
    ['region', '同省'],
    ['country', '同国'],
    ['global', '全球'],
  ])('uses text-backed %s source treatment', (sourceScope, label) => {
    expect(buildMarkerDescriptor({ ...footprint, sourceScope, sourceLabel: label }, {
      pulseIds: new Set(), selectedId: null,
    })).toMatchObject({ sourceScope, label });
  });

  it('uses server unread and only explicit pulse ids', () => {
    expect(buildMarkerDescriptor({ ...footprint, isUnread: true }, {
      pulseIds: new Set(['fp-1']), selectedId: null,
    })).toMatchObject({ unread: true, pulse: true, selected: false });
    expect(buildMarkerDescriptor(footprint, {
      pulseIds: new Set(), selectedId: 'fp-1',
    })).toMatchObject({ unread: false, pulse: false, selected: true });
  });

  it('includes every visual state in the Leaflet icon cache key', () => {
    const descriptor = buildMarkerDescriptor({ ...footprint, isUnread: true }, {
      pulseIds: new Set(['fp-1']), selectedId: 'fp-1',
    });
    expect(markerCacheKey(descriptor)).toBe('🙂:region:unread:selected:pulse');
  });

  it('renders source text and no streak badge', () => {
    const html = buildMarkerHtml(buildMarkerDescriptor(footprint, {
      pulseIds: new Set(), selectedId: null,
    }));
    expect(html).toContain('同省');
    expect(html).not.toContain('99');
    expect(html).not.toMatch(/streak/i);
  });
});

describe('cluster selection', () => {
  it('stops clustering at zoom 17 while keeping click-to-bounds disabled', () => {
    render(<ClusterMarkers footprints={[]} />);

    expect(L.markerClusterGroup).toHaveBeenCalledWith(expect.objectContaining({
      disableClusteringAtZoom: 17,
      zoomToBoundsOnClick: false,
    }));
  });

  it('opens the cluster sheet on first click without fitting the map', () => {
    const openCluster = vi.fn();
    const fitBounds = vi.fn();
    const layer = {
      getAllChildMarkers: () => [
        marker({ id: 'a', lat: 31.23, lng: 121.47, source: 'friend', unread: false }),
        marker({ id: 'b', lat: 31.23, lng: 121.47, source: 'self', unread: true }),
      ],
      getBounds: () => ({
        getSouthWest: () => ({ lat: 31.23, lng: 121.47 }),
        getNorthEast: () => ({ lat: 31.23, lng: 121.47 }),
      }),
    };

    handleClusterClick({
      layer,
      openCluster,
      fitBounds,
      getMapZoom: () => 8,
      getMaxZoom: () => 18,
    });

    expect(openCluster).toHaveBeenCalledWith(expect.objectContaining({
      footprintIds: ['a', 'b'],
      bounds: [[31.23, 121.47], [31.23, 121.47]],
      placeCount: 1,
      footprintCount: 2,
    }));
    expect(fitBounds).not.toHaveBeenCalled();
  });

  it('derives unique places, footprint count, source order, and unread state', () => {
    const descriptor = buildClusterDescriptor([
      marker({ id: 'a', lat: 31.2304001, lng: 121.4737001, source: 'friend', unread: false }),
      marker({ id: 'b', lat: 31.2304002, lng: 121.4737002, source: 'friend', unread: true }),
      marker({ id: 'c', lat: 31.231, lng: 121.474, source: 'self', unread: false }),
    ]);

    expect(descriptor).toMatchObject({
      placeCount: 2,
      footprintCount: 3,
      sourceScopes: ['friend', 'self'],
      hasUnread: true,
      label: '2 个地点',
      accessibleLabel: '2 个地点，3 条足迹，包含未读更新',
    });
  });

  it('renders three stacked pins, a descriptive label, and an accessible name', () => {
    const descriptor = buildClusterDescriptor([
      marker({ id: 'a', lat: 31.23, lng: 121.47, source: 'friend', unread: false }),
    ]);
    const html = buildClusterHtml(descriptor);

    expect(html.match(/bliver-map-cluster__pin--[123]/g)).toHaveLength(3);
    expect(html).toContain('2');
    expect(html).toContain('1 个地点');
    expect(html).toContain('aria-label="1 个地点，1 条足迹"');
  });

  it('escapes descriptor text and includes all visual state in the cache key', () => {
    const descriptor = buildClusterDescriptor([
      marker({ id: 'a', lat: 31.23, lng: 121.47, source: 'unknown', unread: true }),
      marker({ id: 'b', lat: 31.24, lng: 121.48, source: 'global', unread: false }),
    ]);
    const html = buildClusterHtml({ ...descriptor, label: '<script>alert(1)</script>' });

    expect(html).not.toContain('<script>');
    expect(clusterCacheKey(descriptor)).toBe('2:2:global:unread');
  });

});
