import { describe, expect, it, vi } from 'vitest';

vi.mock('leaflet.markercluster', () => ({}));
vi.mock('leaflet', () => ({
  default: {
    divIcon: vi.fn((options) => options),
    markerClusterGroup: vi.fn(),
    marker: vi.fn(),
  },
}));
vi.mock('react-leaflet', () => ({ useMap: vi.fn() }));

import {
  buildMarkerDescriptor,
  buildMarkerHtml,
  markerCacheKey,
  shouldOpenSamePlace,
} from '../ClusterMarkers';

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
  it('opens effectively identical coordinates immediately', () => {
    expect(shouldOpenSamePlace({
      zoom: 8,
      maxZoom: 18,
      childLatLngs: [{ lat: 31.23, lng: 121.47 }, { lat: 31.23, lng: 121.47 }],
    })).toBe(true);
  });

  it('zooms distinct coordinates while useful separation remains', () => {
    expect(shouldOpenSamePlace({
      zoom: 12,
      maxZoom: 18,
      childLatLngs: [{ lat: 31.23, lng: 121.47 }, { lat: 31.2302, lng: 121.4702 }],
    })).toBe(false);
  });

  it('opens close coordinates at the separation threshold', () => {
    expect(shouldOpenSamePlace({
      zoom: 17,
      maxZoom: 18,
      childLatLngs: [{ lat: 31.23, lng: 121.47 }, { lat: 31.2302, lng: 121.4702 }],
    })).toBe(true);
  });
});
