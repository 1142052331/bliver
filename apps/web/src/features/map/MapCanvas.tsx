import { Info, MapPin } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FeatureCollection, Point } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';

import {
  resolveMapProvider,
  type MapAttribution as MapAttributionEntry,
  type MapProviderConfig,
} from './map-provider.js';

const SOURCE_ID = 'bliver-footprints';
const CLUSTER_LAYER_ID = 'bliver-footprint-clusters';
const CLUSTER_COUNT_LAYER_ID = 'bliver-footprint-cluster-count';
const POINT_LAYER_ID = 'bliver-footprint-points';
const MAP_LOAD_TIMEOUT_MS = 12_000;
const INITIALIZATION_ERROR_GRACE_MS = 500;
const RESOURCE_ERROR_THRESHOLD = 3;
const WEB_MERCATOR_MAX_LATITUDE = 85.051129;

export interface MapCanvasItem {
  readonly id: string;
  readonly displayPoint: { readonly lat: number; readonly lng: number };
  readonly author: { readonly name: string };
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
  readonly onViewportChange?: (bounds: MapViewportBounds) => void;
  readonly viewport?: MapViewportBounds;
}

type RenderMode = 'initializing' | 'interactive' | 'failed';

interface FootprintProperties {
  readonly id: string;
  readonly authorName: string;
  readonly selected: boolean;
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
  const onViewportChangeRef = useRef(onViewportChange);
  const lastAppliedViewportRef = useRef<MapViewportBounds | null>(viewport ?? null);
  const lastReportedViewportRef = useRef<MapViewportBounds | null>(null);
  const motionPreference = useReducedMotion();
  const reducedMotion = motionPreference.reduced;
  const runtimeKey = `${runtimeLocale}:${motionPreference.revision}`;
  const [renderMode, setRenderMode] = useState<RenderMode>('initializing');
  const [readyRuntimeKey, setReadyRuntimeKey] = useState<string | null>(null);
  const geographicCenter = useMemo(
    () => centerOf(items, viewport),
    [items, viewport],
  );

  useEffect(() => {
    latestItems.current = items;
    latestSelectedId.current = selectedId;
    latestViewport.current = viewport;
    onSelectRef.current = onSelect;
    onViewportChangeRef.current = onViewportChange;
  }, [items, onSelect, onViewportChange, selectedId, viewport]);

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
        style: mapProvider.styleUrl,
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

    const selectPoint = (event: maplibregl.MapLayerMouseEvent): void => {
      const id = event.features?.[0]?.properties?.['id'];
      if (typeof id === 'string') onSelectRef.current?.(id);
    };

    const expandCluster = (event: maplibregl.MapLayerMouseEvent): void => {
      const feature = event.features?.[0];
      if (feature?.geometry.type !== 'Point') return;
      const clusterId = Number(feature.properties?.['cluster_id']);
      const clusterCenter = feature.geometry.coordinates as [number, number];
      const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
      if (!Number.isFinite(clusterId) || !source?.getClusterExpansionZoom) return;
      void source.getClusterExpansionZoom(clusterId).then((zoom) => {
        if (disposed) return;
        map.easeTo({
          center: clusterCenter,
          zoom,
          duration: 350,
        });
      }).catch(() => undefined);
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
        map.addLayer({
          id: CLUSTER_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#173b31',
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              18,
              12,
              23,
              40,
              29,
            ],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
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
            'text-size': 12,
          },
          paint: { 'text-color': '#ffffff' },
        });
        map.addLayer({
          id: POINT_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': [
              'case',
              ['boolean', ['get', 'selected'], false],
              '#173b31',
              '#a9c9bf',
            ],
            'circle-radius': [
              'case',
              ['boolean', ['get', 'selected'], false],
              11,
              8,
            ],
            'circle-stroke-color': [
              'case',
              ['boolean', ['get', 'selected'], false],
              '#ffffff',
              '#173b31',
            ],
            'circle-stroke-width': [
              'case',
              ['boolean', ['get', 'selected'], false],
              4,
              2,
            ],
          },
        });

        map.on('click', POINT_LAYER_ID, selectPoint);
        map.on('click', CLUSTER_LAYER_ID, expandCluster);
        map.on('mouseenter', POINT_LAYER_ID, showPointer);
        map.on('mouseleave', POINT_LAYER_ID, resetPointer);
        map.on('mouseenter', CLUSTER_LAYER_ID, showPointer);
        map.on('mouseleave', CLUSTER_LAYER_ID, resetPointer);
        loaded = true;
        resourceErrorCount = 0;
        if (initializationErrorTimer) clearTimeout(initializationErrorTimer);
        clearTimeout(loadTimer);
        setReadyRuntimeKey(runtimeKey);
        setRenderMode('interactive');
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
    map.on('moveend', reportViewport);
    map.on('idle', resetResourceErrors);
    map.on('error', handleMapError);
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => map.resize());
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
      map.off('moveend', reportViewport);
      map.off('idle', resetResourceErrors);
      map.off('error', handleMapError);
      if (loaded) {
        map.off('click', POINT_LAYER_ID, selectPoint);
        map.off('click', CLUSTER_LAYER_ID, expandCluster);
        map.off('mouseenter', POINT_LAYER_ID, showPointer);
        map.off('mouseleave', POINT_LAYER_ID, resetPointer);
        map.off('mouseenter', CLUSTER_LAYER_ID, showPointer);
        map.off('mouseleave', CLUSTER_LAYER_ID, resetPointer);
      }
      map.remove();
      if (mapRef.current === map) {
        mapRef.current = null;
      }
      if (disposeRuntimeRef.current === dispose) {
        disposeRuntimeRef.current = null;
      }
    };
    disposeRuntimeRef.current = dispose;
    return dispose;
  }, [mapProvider, nativeMapLocale, reducedMotion, runtimeKey]);

  useEffect(() => {
    if (renderMode === 'failed') disposeRuntimeRef.current?.();
  }, [renderMode]);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource(SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    source?.setData(toFeatureCollection(items, selectedId));
  }, [items, selectedId]);

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
      data-map-ready={runtimeReady ? 'true' : 'false'}
      data-mode={staticMode ? 'static' : runtimeReady ? 'interactive' : 'initializing'}
      data-testid="map-canvas"
    >
      <div
        ref={containerRef}
        aria-label={t('map.interactiveMap')}
        className="map-canvas__viewport"
        role="region"
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
          {items.map((item, index) => {
            const selected = item.id === selectedId;
            return (
              <li key={item.id}>
                <button
                  aria-label={t('map.footprintBy', { name: item.author.name })}
                  aria-pressed={selected}
                  data-testid="map-footprint-item"
                  type="button"
                  onClick={() => onSelect?.(item.id)}
                >
                  <span aria-hidden="true" className="map-canvas__semantic-index">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="map-canvas__semantic-copy">
                    <strong>{item.author.name}</strong>
                    <small>
                      {item.displayPoint.lat.toFixed(2)}, {item.displayPoint.lng.toFixed(2)}
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
