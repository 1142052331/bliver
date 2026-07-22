import { Info, MapPin } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FeatureCollection, Point } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';

import {
  createNaturalCityMapStyle,
  resolveMapProvider,
  type MapAttribution as MapAttributionEntry,
  type MapProviderConfig,
} from './map-provider.js';
import {
  MOMENT_TICKET_CLUSTER_IMAGE_ID,
  MOMENT_TICKET_SPRITES,
  POINT_ICON_IMAGE_EXPRESSION,
  toMapMoodKey,
  type MapMoodKey,
} from './moment-ticket-sprites.js';

const SOURCE_ID = 'bliver-footprints';
const CLUSTER_LAYER_ID = 'bliver-footprint-clusters';
const CLUSTER_COUNT_LAYER_ID = 'bliver-footprint-cluster-count';
const CLUSTER_HIT_LAYER_ID = 'bliver-footprint-cluster-hit';
const POINT_HALO_LAYER_ID = 'bliver-footprint-point-halo';
const POINT_LAYER_ID = 'bliver-footprint-points';
const POINT_HIT_LAYER_ID = 'bliver-footprint-point-hit';
const MAX_CLUSTER_LEAVES = 12;
const MAP_LOAD_TIMEOUT_MS = 12_000;
const INITIALIZATION_ERROR_GRACE_MS = 500;
const RESOURCE_ERROR_THRESHOLD = 3;
const WEB_MERCATOR_MAX_LATITUDE = 85.051129;
const PROGRAMMATIC_CAMERA_EVENT = { bliverProgrammaticCamera: true } as const;

export interface MapCanvasItem {
  readonly id: string;
  readonly displayPoint: { readonly lat: number; readonly lng: number };
  readonly author: { readonly name: string };
  readonly message?: string;
  readonly publishedAt?: string;
  readonly locationPrecision?: 'precise' | 'approximate';
  readonly primaryMedia?: { readonly url?: string };
  readonly mood?: string;
}

export interface MapCanvasSelection {
  readonly kind: 'point' | 'cluster';
  readonly items: readonly MapCanvasItem[];
  readonly anchor?: { readonly x: number; readonly y: number };
  readonly clusterId?: number;
}

export interface MapViewportBounds {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}

interface MapCanvasProps {
  readonly items: readonly MapCanvasItem[];
  readonly selectedId?: string;
  readonly onSelect?: (id: string) => void;
  readonly onActivate?: (selection: MapCanvasSelection) => void;
  readonly onDismiss?: () => void;
  readonly onSelectedPointChange?: (
    point: { readonly x: number; readonly y: number } | undefined,
  ) => void;
  readonly onViewportChange?: (bounds: MapViewportBounds) => void;
  readonly viewport?: MapViewportBounds;
}

type RenderMode = 'initializing' | 'interactive' | 'failed';

interface FootprintProperties {
  readonly id: string;
  readonly authorName: string;
  readonly selected: boolean;
  readonly focused: boolean;
  readonly hasMedia: boolean;
  readonly moodKey: MapMoodKey;
}

function toFeatureCollection(
  items: readonly MapCanvasItem[],
  selectedId: string | undefined,
): FeatureCollection<Point, FootprintProperties> {
  return {
    type: 'FeatureCollection',
    features: items.map((item) => ({
      type: 'Feature',
      id: item.id,
      geometry: {
        type: 'Point',
        coordinates: [item.displayPoint.lng, item.displayPoint.lat],
      },
      properties: {
        id: item.id,
        authorName: item.author.name,
        selected: item.id === selectedId,
        focused: selectedId !== undefined,
        hasMedia: Boolean(item.primaryMedia?.url),
        moodKey: toMapMoodKey(item.mood),
      },
    })),
  };
}

interface MotionPreference {
  readonly reduced: boolean;
  readonly revision: number;
}

function useReducedMotion(): MotionPreference {
  const [preference, setPreference] = useState<MotionPreference>(() => ({
    reduced: typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
    revision: 0,
  }));

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = (event: MediaQueryListEvent): void => {
      setPreference((current) => event.matches === current.reduced
        ? current
        : { reduced: event.matches, revision: current.revision + 1 });
    };
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return preference;
}

function centerOf(
  items: readonly MapCanvasItem[],
  viewport: MapViewportBounds | undefined,
): { readonly lat: number; readonly lng: number } {
  if (items.length > 0) {
    const total = items.reduce(
      (sum, item) => ({
        lat: sum.lat + item.displayPoint.lat,
        lng: sum.lng + item.displayPoint.lng,
      }),
      { lat: 0, lng: 0 },
    );
    return { lat: total.lat / items.length, lng: total.lng / items.length };
  }
  if (viewport) {
    return {
      lat: (viewport.south + viewport.north) / 2,
      lng: (viewport.west + viewport.east) / 2,
    };
  }
  return { lat: 31.23, lng: 121.47 };
}

function boundsMatch(
  first: MapViewportBounds,
  second: MapViewportBounds,
): boolean {
  const epsilon = 0.000001;
  return Math.abs(first.west - second.west) < epsilon
    && Math.abs(first.south - second.south) < epsilon
    && Math.abs(first.east - second.east) < epsilon
    && Math.abs(first.north - second.north) < epsilon;
}

function MapAttributionDisclosure({
  attributions,
  label,
}: {
  readonly attributions: readonly MapAttributionEntry[];
  readonly label: string;
}) {
  return (
    <details className="map-canvas__attribution">
      <summary aria-label={label} title={label}>
        <Info aria-hidden="true" />
      </summary>
      <div>
        {attributions.map((attribution) => (
          <a
            href={attribution.href}
            key={`${attribution.label}:${attribution.href}`}
            rel="noreferrer"
            target="_blank"
          >
            {attribution.label}
          </a>
        ))}
      </div>
    </details>
  );
}

export function MapCanvas({
  items,
  selectedId,
  onSelect,
  onActivate,
  onDismiss,
  onSelectedPointChange,
  onViewportChange,
  viewport,
}: MapCanvasProps) {
  const { i18n, t } = useTranslation();
  const mapProvider = useMemo<MapProviderConfig | null>(() => {
    try {
      return resolveMapProvider();
    } catch {
      return null;
    }
  }, []);
  const runtimeLocale = i18n.resolvedLanguage ?? i18n.language;
  const nativeMapLocale = useMemo(() => {
    const translate = i18n.getFixedT(runtimeLocale);
    return {
      'Map.Title': translate('map.interactiveMap'),
      'NavigationControl.ZoomIn': translate('map.zoomIn'),
      'NavigationControl.ZoomOut': translate('map.zoomOut'),
    };
  }, [i18n, runtimeLocale]);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const disposeRuntimeRef = useRef<(() => void) | null>(null);
  const latestItems = useRef(items);
  const latestSelectedId = useRef(selectedId);
  const latestViewport = useRef(viewport);
  const onSelectRef = useRef(onSelect);
  const onActivateRef = useRef(onActivate);
  const onDismissRef = useRef(onDismiss);
  const onSelectedPointChangeRef = useRef(onSelectedPointChange);
  const onViewportChangeRef = useRef(onViewportChange);
  const lastAppliedViewportRef = useRef<MapViewportBounds | null>(viewport ?? null);
  const lastReportedViewportRef = useRef<MapViewportBounds | null>(null);
  const lastSelectedPointRef = useRef<
    { readonly x: number; readonly y: number } | undefined
  >(undefined);
  const lastCinematicallyFocusedIdRef = useRef<string | undefined>(undefined);
  const motionPreference = useReducedMotion();
  const reducedMotion = motionPreference.reduced;
  const runtimeKey = `${runtimeLocale}:${motionPreference.revision}`;
  const [renderMode, setRenderMode] = useState<RenderMode>('initializing');
  const [readyRuntimeKey, setReadyRuntimeKey] = useState<string | null>(null);
  const geographicCenter = useMemo(
    () => centerOf(items, viewport),
    [items, viewport],
  );

  const reportSelectedPoint = useCallback((): void => {
    const map = mapRef.current;
    const container = containerRef.current;
    const selected = latestSelectedId.current
      ? latestItems.current.find((item) => item.id === latestSelectedId.current)
      : undefined;

    if (!map || !container || !selected || typeof map.project !== 'function') {
      if (lastSelectedPointRef.current) {
        lastSelectedPointRef.current = undefined;
        onSelectedPointChangeRef.current?.(undefined);
      }
      return;
    }

    let projected: maplibregl.Point;
    try {
      projected = map.project([
        selected.displayPoint.lng,
        selected.displayPoint.lat,
      ]);
    } catch {
      return;
    }
    const next = {
      x: Math.max(16, Math.min(container.clientWidth - 16, projected.x)),
      y: Math.max(16, Math.min(container.clientHeight - 16, projected.y)),
    };
    const previous = lastSelectedPointRef.current;
    if (previous && Math.abs(previous.x - next.x) < 0.5 && Math.abs(previous.y - next.y) < 0.5) {
      return;
    }
    lastSelectedPointRef.current = next;
    onSelectedPointChangeRef.current?.(next);
  }, []);

  useEffect(() => {
    latestItems.current = items;
    latestSelectedId.current = selectedId;
    latestViewport.current = viewport;
    onSelectRef.current = onSelect;
    onActivateRef.current = onActivate;
    onDismissRef.current = onDismiss;
    onSelectedPointChangeRef.current = onSelectedPointChange;
    onViewportChangeRef.current = onViewportChange;
  }, [items, onActivate, onDismiss, onSelect, onSelectedPointChange, onViewportChange, selectedId, viewport]);

  useEffect(() => {
    if (reducedMotion || !mapProvider) return undefined;

    const container = containerRef.current;
    if (!container) return undefined;
    setRenderMode('initializing');

    let map: maplibregl.Map;
    let loaded = false;
    let disposed = false;
    let resourceErrorCount = 0;
    let initializationErrorTimer: ReturnType<typeof setTimeout> | undefined;
    let resizeObserver: ResizeObserver | undefined;
    const runtimeViewport = latestViewport.current;
    const runtimeCenter = centerOf(latestItems.current, runtimeViewport);

    const fail = (): void => {
      if (!disposed) setRenderMode('failed');
    };

    try {
      map = new maplibregl.Map({
        container,
        center: [runtimeCenter.lng, runtimeCenter.lat],
        zoom: runtimeViewport ? 8 : 11,
        renderWorldCopies: false,
        // MapLibre 5.24 crashes during its first resize when full-world
        // maxBounds are supplied before projection matrices exist.
        ...(runtimeViewport
          ? {
              bounds: [
                [runtimeViewport.west, runtimeViewport.south],
                [runtimeViewport.east, runtimeViewport.north],
              ] as [[number, number], [number, number]],
              fitBoundsOptions: { animate: false },
            }
          : {}),
        locale: nativeMapLocale,
        // Keep CJK labels readable without asking the style's glyph stack to
        // render a second line for every place name.
        localIdeographFontFamily: runtimeLocale.startsWith('ja')
          ? 'Noto Sans JP, Hiragino Sans, sans-serif'
          : runtimeLocale.startsWith('zh')
            ? 'Noto Sans SC, PingFang SC, sans-serif'
            : 'Noto Sans SC, Noto Sans JP, sans-serif',
        fadeDuration: 120,
        attributionControl: false,
        canvasContextAttributes: {
          antialias: true,
          powerPreference: 'high-performance',
        },
      });
    } catch {
      disposeRuntimeRef.current = null;
      fail();
      return undefined;
    }

    mapRef.current = map;
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'bottom-left',
    );

    const readViewport = (): MapViewportBounds => {
      const bounds = map.getBounds();
      const west = Math.max(-180, Math.min(180, bounds.getWest()));
      const south = Math.max(
        -WEB_MERCATOR_MAX_LATITUDE,
        Math.min(WEB_MERCATOR_MAX_LATITUDE, bounds.getSouth()),
      );
      const east = Math.max(-180, Math.min(180, bounds.getEast()));
      const north = Math.max(
        -WEB_MERCATOR_MAX_LATITUDE,
        Math.min(WEB_MERCATOR_MAX_LATITUDE, bounds.getNorth()),
      );
      return {
        west: west < east ? west : -180,
        south: south < north ? south : -WEB_MERCATOR_MAX_LATITUDE,
        east: west < east ? east : 180,
        north: south < north ? north : WEB_MERCATOR_MAX_LATITUDE,
      };
    };

    const reportViewport = (): void => {
      const nextViewport = readViewport();
      latestViewport.current = nextViewport;
      lastReportedViewportRef.current = nextViewport;
      onViewportChangeRef.current?.(nextViewport);
    };

    const resolveAnchor = (
      event: maplibregl.MapLayerMouseEvent,
      coordinates?: readonly [number, number],
    ): { readonly x: number; readonly y: number } | undefined => {
      if (Number.isFinite(event.point?.x) && Number.isFinite(event.point?.y)) {
        return { x: event.point.x, y: event.point.y };
      }
      if (!coordinates || typeof map.project !== 'function') return undefined;
      try {
        const point = map.project([coordinates[0], coordinates[1]]);
        return Number.isFinite(point.x) && Number.isFinite(point.y)
          ? { x: point.x, y: point.y }
          : undefined;
      } catch {
        return undefined;
      }
    };

    const selectPoint = (event: maplibregl.MapLayerMouseEvent): void => {
      const feature = event.features?.[0];
      const id = feature?.properties?.['id'];
      if (typeof id !== 'string') return;
      const item = latestItems.current.find((candidate) => candidate.id === id);
      if (!item) return;
      const coordinates = feature?.geometry.type === 'Point'
        ? feature.geometry.coordinates as [number, number]
        : [item.displayPoint.lng, item.displayPoint.lat] as [number, number];
      const anchor = resolveAnchor(event, coordinates);
      onActivateRef.current?.({
        kind: 'point',
        items: [item],
        ...(anchor ? { anchor } : {}),
      });
      onSelectRef.current?.(id);
    };

    const activateCluster = (event: maplibregl.MapLayerMouseEvent): void => {
      const feature = event.features?.[0];
      if (feature?.geometry.type !== 'Point') return;
      const clusterId = Number(feature.properties?.['cluster_id']);
      const clusterCenter = feature.geometry.coordinates as [number, number];
      const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
      if (!Number.isFinite(clusterId) || !source?.getClusterLeaves) return;
      const anchor = resolveAnchor(event, clusterCenter);
      void source.getClusterLeaves(clusterId, MAX_CLUSTER_LEAVES, 0).then((leaves) => {
        if (disposed) return;
        const itemsById = new Map(latestItems.current.map((item) => [item.id, item]));
        const clusterItems: MapCanvasItem[] = [];
        const includedIds = new Set<string>();
        for (const leaf of leaves) {
          const id = leaf.properties?.['id'] ?? leaf.id;
          if (typeof id !== 'string' || includedIds.has(id)) continue;
          const item = itemsById.get(id);
          if (!item) continue;
          includedIds.add(id);
          clusterItems.push(item);
        }
        if (clusterItems.length === 0) return;
        onActivateRef.current?.({
          kind: 'cluster',
          items: clusterItems,
          clusterId,
          ...(anchor ? { anchor } : {}),
        });
      }).catch(() => undefined);
    };

    const dismissFromMap = (event: maplibregl.MapMouseEvent): void => {
      try {
        const interactiveFeatures = map.queryRenderedFeatures(event.point, {
          layers: [
            POINT_HIT_LAYER_ID,
            POINT_LAYER_ID,
            CLUSTER_HIT_LAYER_ID,
            CLUSTER_LAYER_ID,
          ],
        });
        if (interactiveFeatures.length > 0) return;
      } catch {
        // A background click still dismisses if the renderer cannot be queried.
      }
      onDismissRef.current?.();
    };

    const dismissFromDrag = (): void => {
      onDismissRef.current?.();
    };

    const showPointer = (): void => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const resetPointer = (): void => {
      map.getCanvas().style.cursor = '';
    };

    const load = (): void => {
      try {
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: toFeatureCollection(latestItems.current, latestSelectedId.current),
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 48,
        });
        for (const [id, sprite] of MOMENT_TICKET_SPRITES) {
          map.addImage(id, sprite, { pixelRatio: 2 });
        }
        map.addLayer({
          id: CLUSTER_HIT_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#173b31',
            'circle-opacity': 0,
            'circle-radius': 24,
            'circle-translate': [0, -20],
          },
        });
        map.addLayer({
          id: POINT_HIT_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': '#173b31',
            'circle-opacity': 0,
            'circle-radius': 22,
            'circle-translate': [0, -18],
          },
        });
        map.addLayer({
          id: CLUSTER_LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          filter: ['has', 'point_count'],
          layout: {
            'icon-allow-overlap': true,
            'icon-anchor': 'bottom',
            'icon-ignore-placement': true,
            'icon-image': MOMENT_TICKET_CLUSTER_IMAGE_ID,
            'icon-padding': 0,
            'icon-size': 1,
          },
        });
        map.addLayer({
          id: CLUSTER_COUNT_LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': ['Noto Sans Regular'],
            'text-allow-overlap': true,
            'text-ignore-placement': true,
            'text-offset': [0.28, -1.62],
            'text-size': 11,
          },
          paint: { 'text-color': '#ffffff' },
        });
        map.addLayer({
          id: POINT_HALO_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': '#173b31',
            'circle-radius': [
              'case',
              ['boolean', ['get', 'selected'], false],
              27,
              0,
            ],
            'circle-opacity': [
              'case',
              ['boolean', ['get', 'selected'], false],
              0.16,
              0,
            ],
            'circle-stroke-color': '#173b31',
            'circle-stroke-width': [
              'case',
              ['boolean', ['get', 'selected'], false],
              1,
              0,
            ],
            'circle-stroke-opacity': 0.28,
            'circle-translate': [0, -18],
            // One GPU layer gives the selected marker a single focus pulse;
            // no per-marker DOM nodes or timelines are created.
            'circle-blur': 0.22,
            'circle-radius-transition': { duration: 420 },
            'circle-opacity-transition': { duration: 280 },
          },
        });
        map.addLayer({
          id: POINT_LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          layout: {
            'icon-allow-overlap': true,
            'icon-anchor': 'bottom',
            'icon-ignore-placement': true,
            'icon-image': POINT_ICON_IMAGE_EXPRESSION,
            'icon-padding': 0,
            'icon-size': [
              'case',
              ['boolean', ['get', 'selected'], false],
              1.08,
              1,
            ],
          },
          paint: {
            'icon-opacity': [
              'case',
              ['boolean', ['get', 'selected'], false],
              1,
              ['boolean', ['get', 'focused'], false],
              0.56,
              0.92,
            ],
            'icon-opacity-transition': { duration: 220 },
          },
        });

        map.on('click', POINT_HIT_LAYER_ID, selectPoint);
        map.on('click', CLUSTER_HIT_LAYER_ID, activateCluster);
        map.on('mouseenter', POINT_HIT_LAYER_ID, showPointer);
        map.on('mouseleave', POINT_HIT_LAYER_ID, resetPointer);
        map.on('mouseenter', CLUSTER_HIT_LAYER_ID, showPointer);
        map.on('mouseleave', CLUSTER_HIT_LAYER_ID, resetPointer);
        map.on('click', dismissFromMap);
        map.on('dragstart', dismissFromDrag);
        loaded = true;
        resourceErrorCount = 0;
        if (initializationErrorTimer) clearTimeout(initializationErrorTimer);
        clearTimeout(loadTimer);
        setReadyRuntimeKey(runtimeKey);
        setRenderMode('interactive');
        reportSelectedPoint();
      } catch {
        fail();
      }
    };

    const resetResourceErrors = (): void => {
      resourceErrorCount = 0;
    };

    const handleMapError = (): void => {
      if (disposed) return;
      if (!loaded) {
        if (!initializationErrorTimer) {
          initializationErrorTimer = setTimeout(
            fail,
            INITIALIZATION_ERROR_GRACE_MS,
          );
        }
        return;
      }
      resourceErrorCount += 1;
      if (resourceErrorCount >= RESOURCE_ERROR_THRESHOLD) fail();
    };

    const loadTimer = setTimeout(fail, MAP_LOAD_TIMEOUT_MS);
    map.on('load', load);
    const reportMovedViewport = (event: maplibregl.MapLibreEvent): void => {
      const programmatic = Boolean(
        (event as (maplibregl.MapLibreEvent & {
          readonly bliverProgrammaticCamera?: boolean;
        }) | undefined)?.bliverProgrammaticCamera,
      );
      if (!programmatic) {
        reportViewport();
      }
      reportSelectedPoint();
    };
    map.on('moveend', reportMovedViewport);
    map.on('idle', resetResourceErrors);
    map.on('error', handleMapError);
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        map.resize();
        reportSelectedPoint();
      });
      resizeObserver.observe(container);
    }

    const dispose = (): void => {
      if (disposed) return;
      disposed = true;
      clearTimeout(loadTimer);
      if (initializationErrorTimer) clearTimeout(initializationErrorTimer);
      resizeObserver?.disconnect();
      if (loaded) {
        try {
          latestViewport.current = readViewport();
        } catch {
          // A partially failed renderer may no longer expose camera bounds.
        }
      }
      map.off('load', load);
      map.off('moveend', reportMovedViewport);
      map.off('idle', resetResourceErrors);
      map.off('error', handleMapError);
      if (loaded) {
        map.off('click', POINT_HIT_LAYER_ID, selectPoint);
        map.off('click', CLUSTER_HIT_LAYER_ID, activateCluster);
        map.off('mouseenter', POINT_HIT_LAYER_ID, showPointer);
        map.off('mouseleave', POINT_HIT_LAYER_ID, resetPointer);
        map.off('mouseenter', CLUSTER_HIT_LAYER_ID, showPointer);
        map.off('mouseleave', CLUSTER_HIT_LAYER_ID, resetPointer);
        map.off('click', dismissFromMap);
        map.off('dragstart', dismissFromDrag);
      }
      map.remove();
      if (mapRef.current === map) {
        mapRef.current = null;
      }
      if (disposeRuntimeRef.current === dispose) {
        disposeRuntimeRef.current = null;
      }
      lastSelectedPointRef.current = undefined;
      onSelectedPointChangeRef.current?.(undefined);
    };
    disposeRuntimeRef.current = dispose;

    try {
      // Fetch the provider style through MapLibre, then retheme its vector
      // layers before the first frame is committed. This keeps the map's
      // material treatment in the style pipeline rather than filtering the
      // entire WebGL canvas in CSS.
      map.setStyle(mapProvider.styleUrl, {
        transformStyle: (_previous, next) => createNaturalCityMapStyle(next, runtimeLocale),
      });
    } catch {
      dispose();
      fail();
      return undefined;
    }

    return dispose;
  }, [mapProvider, nativeMapLocale, reducedMotion, reportSelectedPoint, runtimeKey, runtimeLocale]);

  useEffect(() => {
    if (renderMode === 'failed') disposeRuntimeRef.current?.();
  }, [renderMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      const source = map.getSource(SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      source?.setData(toFeatureCollection(items, selectedId));
    } catch {
      return;
    }
    reportSelectedPoint();
  }, [items, reportSelectedPoint, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    const selected = selectedId
      ? items.find((item) => item.id === selectedId)
      : undefined;

    if (!map || !container || renderMode !== 'interactive' || reducedMotion || !selected) {
      if (!selectedId) lastCinematicallyFocusedIdRef.current = undefined;
      return;
    }
    if (lastCinematicallyFocusedIdRef.current === selectedId) return;
    lastCinematicallyFocusedIdRef.current = selectedId;

    try {
      if (typeof map.stop === 'function') map.stop();
      const currentZoom = typeof map.getZoom === 'function' ? map.getZoom() : 10;
      const targetZoom = selected.locationPrecision === 'approximate'
        ? Math.min(11.5, Math.max(10.25, currentZoom))
        : Math.min(14, Math.max(12.75, currentZoom));
      const wide = container.clientWidth >= 768;
      map.easeTo({
        center: [selected.displayPoint.lng, selected.displayPoint.lat],
        zoom: targetZoom,
        offset: wide
          ? [Math.min(180, container.clientWidth * 0.12), 0]
          : [0, -Math.min(120, container.clientHeight * 0.13)],
        duration: 480,
        easing: (progress) => 1 - (1 - progress) ** 4,
      }, PROGRAMMATIC_CAMERA_EVENT);
    } catch {
      return;
    }
  }, [items, reducedMotion, renderMode, reportSelectedPoint, selectedId]);

  const viewportWest = viewport?.west;
  const viewportSouth = viewport?.south;
  const viewportEast = viewport?.east;
  const viewportNorth = viewport?.north;

  useEffect(() => {
    const map = mapRef.current;
    if (
      !map ||
      viewportWest === undefined ||
      viewportSouth === undefined ||
      viewportEast === undefined ||
      viewportNorth === undefined
    ) return;
    const nextViewport = {
      west: viewportWest,
      south: viewportSouth,
      east: viewportEast,
      north: viewportNorth,
    };
    if (
      lastReportedViewportRef.current
      && boundsMatch(lastReportedViewportRef.current, nextViewport)
    ) {
      lastReportedViewportRef.current = null;
      lastAppliedViewportRef.current = nextViewport;
      return;
    }
    if (
      lastAppliedViewportRef.current
      && boundsMatch(lastAppliedViewportRef.current, nextViewport)
    ) return;
    lastAppliedViewportRef.current = nextViewport;
    map.fitBounds(
      [
        [viewportWest, viewportSouth],
        [viewportEast, viewportNorth],
      ],
      { animate: false },
      PROGRAMMATIC_CAMERA_EVENT,
    );
  }, [viewportEast, viewportNorth, viewportSouth, viewportWest]);

  const staticMode = reducedMotion || !mapProvider || renderMode === 'failed';
  const runtimeReady = !staticMode
    && renderMode === 'interactive'
    && readyRuntimeKey === runtimeKey;
  const staticTitle = reducedMotion
    ? t('map.staticReducedTitle')
    : t('map.staticUnavailableTitle');
  const itemCount = t('map.footprintCount', { count: items.length });

  return (
    <div
      className="map-canvas"
      data-has-items={items.length > 0 ? 'true' : 'false'}
      data-map-ready={runtimeReady ? 'true' : 'false'}
      data-mode={staticMode ? 'static' : runtimeReady ? 'interactive' : 'initializing'}
      data-testid="map-canvas"
    >
      <div
        ref={containerRef}
        aria-label={t('map.interactiveMap')}
        className="map-canvas__viewport"
        role="region"
        tabIndex={-1}
      />
      {staticMode ? (
        <div className="map-canvas__fallback" data-testid="map-static-fallback" role="status">
          <MapPin aria-hidden="true" />
          <strong>{staticTitle}</strong>
          <p>{t('map.staticSummary', {
            count: items.length,
            lat: geographicCenter.lat.toFixed(2),
            lng: geographicCenter.lng.toFixed(2),
          })}</p>
        </div>
      ) : null}
      {mapProvider ? (
        <MapAttributionDisclosure
          attributions={mapProvider.attributions}
          label={t('map.mapAttribution')}
        />
      ) : null}
      <aside className="map-canvas__semantic" aria-label={t('map.nearbyFootprints')}>
        <div className="map-canvas__semantic-heading">
          <span>{t('map.nearbyFootprints')}</span>
          <small>{itemCount}</small>
        </div>
        <ol data-testid="map-footprint-list">
          {items.map((item) => {
            const selected = item.id === selectedId;
            return (
              <li key={item.id}>
                <button
                  aria-label={t('map.footprintBy', { name: item.author.name })}
                  aria-pressed={selected}
                  data-footprint-id={item.id}
                  data-testid="map-footprint-item"
                  type="button"
                  onClick={() => {
                    onActivate?.({ kind: 'point', items: [item] });
                    onSelect?.(item.id);
                  }}
                >
                  <span aria-hidden="true" className="map-canvas__semantic-index">
                    {Array.from(item.author.name.trim())[0]?.toLocaleUpperCase(runtimeLocale) ?? '?'}
                  </span>
                  <span className="map-canvas__semantic-copy">
                    <strong>{item.author.name}</strong>
                    <small>
                      {item.message?.trim()
                        || `${item.displayPoint.lat.toFixed(2)}, ${item.displayPoint.lng.toFixed(2)}`}
                    </small>
                  </span>
                  {selected ? <span className="map-canvas__selected">{t('map.selected')}</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}
