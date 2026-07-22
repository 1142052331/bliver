import { placeSearchResponse, type FootprintMediaPreview } from '@bliver/contracts';
import { Button } from '@bliver/ui';
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query';
import { AlertTriangle, CloudOff, LoaderCircle, MapPin } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import {
  gsap,
  motionTokens,
  useGSAP,
  withMotionPreferences,
} from '../../platform/motion/gsap.js';
import {
  MapCanvas,
  type MapCanvasItem,
  type MapCanvasSelection,
  type MapViewportBounds,
} from './MapCanvas.js';
import {
  ChronoLens,
  type ChronoLensPoint,
} from './ChronoLens.js';
import { MapControls, type MapControlStatus } from './MapControls.js';
import { MomentDeck } from './MomentDeck.js';
import { useMapFootprintsQuery } from './api.js';
import { connectMapRealtime } from './realtime.js';
import './map.css';

export interface MapItem extends MapCanvasItem {
  readonly visibility: 'public' | 'friends' | 'private';
  readonly locationPrecision: 'precise' | 'approximate';
  readonly publishedAt: string;
  readonly message?: string;
  readonly primaryMedia?: FootprintMediaPreview;
}

export type MapState = 'loading' | 'error' | 'empty' | 'ready';

const SAFE_VIEWPORT: MapViewportBounds = {
  west: 120,
  south: 30,
  east: 122,
  north: 32,
};

interface PendingLocationRequest {
  readonly invalidate: () => void;
}

interface MapRouteProps {
  readonly state?: MapState;
  readonly items?: readonly MapItem[];
  readonly onRetry?: () => void;
  readonly loadFromApi?: boolean;
  readonly freezeViewport?: boolean;
}

interface MapStageStatusProps {
  readonly kind: 'loading' | 'error' | 'empty';
  readonly offline?: boolean;
  readonly onRetry?: () => void;
}

interface MomentGroupSelection {
  readonly items: readonly MapItem[];
  readonly anchor?: ChronoLensPoint;
}

/**
 * Keeps the map canvas mounted while data changes. The notice is deliberately
 * a caption layer over the stage, so a transient API failure never turns the
 * map route into a generic full-page error card.
 */
function MapStageStatus({ kind, offline = false, onRetry }: MapStageStatusProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<SVGSVGElement>(null);

  useGSAP(() => {
    const root = rootRef.current;
    if (!root) return;

    return withMotionPreferences(root, ({ reducedMotion }) => {
      const animated = [root, iconRef.current].filter(
        (node): node is HTMLDivElement | SVGSVGElement => node !== null,
      );
      gsap.killTweensOf(animated);

      if (reducedMotion) {
        gsap.set(animated, {
          clearProps: 'transform,opacity,visibility,willChange',
        });
        return;
      }

      const timeline = gsap.timeline({ defaults: { overwrite: 'auto' } });
      timeline.fromTo(root, { opacity: 0.62, y: 14 }, {
        opacity: 1,
        y: 0,
        duration: motionTokens.duration.state,
        ease: motionTokens.ease.quiet,
        clearProps: 'transform,opacity',
      });
      if (kind === 'loading' && iconRef.current) {
        timeline.to(iconRef.current, {
          rotation: 360,
          transformOrigin: 'center center',
          duration: 0.9,
          ease: 'none',
          repeat: -1,
        }, 0);
      }
      return () => timeline.kill();
    });
  }, { dependencies: [kind], scope: rootRef, revertOnUpdate: true });

  const title = kind === 'loading'
    ? t('map.loading')
    : kind === 'empty'
      ? t('map.emptyTitle')
      : offline
        ? t('map.offlineTitle')
        : t('map.unavailableTitle');
  const body = kind === 'loading'
    ? ''
    : kind === 'empty'
      ? t('map.emptyBody')
      : offline
        ? t('map.offlineBody')
        : t('map.unavailableBody');
  const Icon = kind === 'loading'
    ? LoaderCircle
    : offline
      ? CloudOff
      : kind === 'empty'
        ? MapPin
        : AlertTriangle;

  return (
    <div
      ref={rootRef}
      className={`map-route__stage-status map-route__stage-status--${kind}`}
      data-map-stage-status={kind}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      <span className="map-route__stage-status-icon" aria-hidden="true">
        <Icon ref={iconRef} />
      </span>
      <span className="map-route__stage-status-copy">
        {kind === 'loading' ? <strong>{title}</strong> : <h2>{title}</h2>}
        {body ? <span>{body}</span> : null}
      </span>
      {kind === 'error' && onRetry ? (
        <Button variant="secondary" onClick={onRetry}>{t('common.retry')}</Button>
      ) : null}
    </div>
  );
}

function numericParam(
  params: URLSearchParams,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = params.get(key);
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
}

function viewportFromParams(params: URLSearchParams): MapViewportBounds {
  const rawBounds = {
    west: params.get('west'),
    south: params.get('south'),
    east: params.get('east'),
    north: params.get('north'),
  };
  const bounds = {
    west: Number(rawBounds.west),
    south: Number(rawBounds.south),
    east: Number(rawBounds.east),
    north: Number(rawBounds.north),
  };
  const hasCompleteRectangle = Object.values(rawBounds).every(
    (value) => value !== null && value.trim() !== '',
  );
  const hasFiniteCoordinates = Object.values(bounds).every(Number.isFinite);
  const isWithinCoordinateRange = bounds.west >= -180
    && bounds.west <= 180
    && bounds.east >= -180
    && bounds.east <= 180
    && bounds.south >= -90
    && bounds.south <= 90
    && bounds.north >= -90
    && bounds.north <= 90;
  const isSupportedRectangle = bounds.west < bounds.east
    && bounds.south < bounds.north;

  return hasCompleteRectangle
    && hasFiniteCoordinates
    && isWithinCoordinateRange
    && isSupportedRectangle
    ? bounds
    : SAFE_VIEWPORT;
}

export function MapRoute(props: MapRouteProps) {
  const client = useMemo(() => new QueryClient(), []);
  return (
    <QueryClientProvider client={client}>
      <MapRouteBody {...props} />
    </QueryClientProvider>
  );
}

function MapRouteBody({
  state = 'ready',
  items = [],
  onRetry,
  loadFromApi = false,
  freezeViewport = false,
}: MapRouteProps) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const paramsRef = useRef(params);
  const queryClient = useQueryClient();
  const searchAbortRef = useRef<AbortController | null>(null);
  const locationRequestRef = useRef<PendingLocationRequest | null>(null);
  const semanticReturnFocusRef = useRef<string | null>(null);
  const [controlStatus, setControlStatus] = useState<MapControlStatus>();
  const [chronoAnchor, setChronoAnchor] = useState<ChronoLensPoint>();
  const [momentGroup, setMomentGroup] = useState<MomentGroupSelection>();

  useLayoutEffect(() => {
    paramsRef.current = params;
  }, [params]);

  const updateParams = useCallback((
    mutate: (next: URLSearchParams) => void,
    replace = false,
  ): void => {
    const next = new URLSearchParams(paramsRef.current);
    mutate(next);
    paramsRef.current = next;
    if (replace) setParams(next, { replace: true });
    else setParams(next);
  }, [setParams]);

  useEffect(
    () => loadFromApi ? connectMapRealtime(queryClient) : undefined,
    [loadFromApi, queryClient],
  );
  useEffect(() => () => {
    searchAbortRef.current?.abort();
    locationRequestRef.current?.invalidate();
    locationRequestRef.current = null;
  }, []);

  const viewport = viewportFromParams(params);
  const requestedLimit = numericParam(params, 'limit', 100, 1, 100);
  const visibility = params.get('visibility');
  const remote = useMapFootprintsQuery({
    ...viewport,
    limit: Math.floor(requestedLimit),
    ...(params.get('cursor') ? { cursor: params.get('cursor') as string } : {}),
    ...(visibility === 'public' || visibility === 'friends' || visibility === 'private' ? {
      visibility,
    } : {}),
  }, loadFromApi);
  const visibleItems = useMemo(
    () => loadFromApi ? (remote.data?.items ?? []) as MapItem[] : items,
    [items, loadFromApi, remote.data?.items],
  );
  const selectedId = params.get('footprint');
  const sheet = params.get('sheet');
  const searchOpen = params.get('search') === 'open';
  const matchedSelected = useMemo(
    () => visibleItems.find((item) => item.id === selectedId),
    [visibleItems, selectedId],
  );
  const explicitSelected = selectedId ? matchedSelected : undefined;
  const selected = explicitSelected;

  useEffect(() => {
    if (!selected || semanticReturnFocusRef.current !== selected.id) return undefined;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLAnchorElement>('.chrono-lens__open')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selected]);

  useEffect(() => {
    const waitingForRemoteItems = loadFromApi && remote.isLoading;
    if (selectedId && !waitingForRemoteItems && !matchedSelected) {
      updateParams((next) => {
        next.delete('footprint');
        next.set('sheet', 'closed');
      }, true);
    }
  }, [loadFromApi, matchedSelected, remote.isLoading, selectedId, updateParams]);
  useEffect(() => {
    if (!searchOpen) {
      searchAbortRef.current?.abort();
      searchAbortRef.current = null;
    }
  }, [searchOpen]);

  const retry = (): void => {
    onRetry?.();
    if (loadFromApi) void remote.refetch();
  };

  const dismissMoment = (): void => {
    if (!selectedId && !momentGroup && sheet !== 'group' && sheet !== 'preview') return;
    setMomentGroup(undefined);
    setChronoAnchor(undefined);
    updateParams((next) => {
      next.delete('footprint');
      next.set('sheet', 'closed');
    });
  };

  const openMoment = (item: MapItem, anchor?: ChronoLensPoint): void => {
    setMomentGroup(undefined);
    setChronoAnchor(anchor);
    updateParams((next) => {
      next.set('footprint', item.id);
      next.set('sheet', 'preview');
      next.set('lat', String(item.displayPoint.lat));
      next.set('lng', String(item.displayPoint.lng));
    });
  };

  const activateMoment = (selection: MapCanvasSelection): void => {
    semanticReturnFocusRef.current = null;
    const selectionItems = selection.items
      .map((item) => visibleItems.find((candidate) => candidate.id === item.id))
      .filter((item): item is MapItem => item !== undefined);
    const first = selectionItems[0];
    if (!first) return;

    if (selection.kind === 'point' || selectionItems.length === 1) {
      openMoment(first, selection.anchor);
      return;
    }

    setChronoAnchor(undefined);
    setMomentGroup({
      items: selectionItems,
      ...(selection.anchor ? { anchor: selection.anchor } : {}),
    });
    updateParams((next) => {
      next.delete('footprint');
      next.set('sheet', 'group');
      next.set('lat', String(first.displayPoint.lat));
      next.set('lng', String(first.displayPoint.lng));
    });
  };

  const expandMomentGroup = (): void => {
    if (!momentGroup?.items.length) return;
    const latitudes = momentGroup.items.map((item) => item.displayPoint.lat);
    const longitudes = momentGroup.items.map((item) => item.displayPoint.lng);
    const south = Math.min(...latitudes);
    const north = Math.max(...latitudes);
    const west = Math.min(...longitudes);
    const east = Math.max(...longitudes);
    const latPadding = Math.max(0.006, (north - south) * 0.24);
    const lngPadding = Math.max(0.006, (east - west) * 0.24);
    updateParams((next) => {
      next.set('west', String(Math.max(-180, west - lngPadding)));
      next.set('south', String(Math.max(-90, south - latPadding)));
      next.set('east', String(Math.min(180, east + lngPadding)));
      next.set('north', String(Math.min(90, north + latPadding)));
      next.set('lat', String((south + north) / 2));
      next.set('lng', String((west + east) / 2));
      next.delete('cursor');
    });
  };

  const search = async (query: string): Promise<void> => {
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setControlStatus(undefined);
    updateParams((next) => {
      next.set('search', 'open');
    });
    try {
      const response = await fetch(
        `/api/v1/places/search?q=${encodeURIComponent(query)}`,
        { credentials: 'include', signal: controller.signal },
      );
      if (!response.ok) throw new Error('PLACE_SEARCH_FAILED');
      const result = placeSearchResponse.parse(await response.json());
      if (controller.signal.aborted) return;
      const first = result.items[0];
      if (!first) {
        setControlStatus({ kind: 'info', message: t('map.noPlacesFound') });
        return;
      }
      const span = 0.02;
      updateParams((next) => {
        next.delete('cursor');
        next.set('west', String(first.lng - span));
        next.set('east', String(first.lng + span));
        next.set('south', String(first.lat - span));
        next.set('north', String(first.lat + span));
        next.set('lat', String(first.lat));
        next.set('lng', String(first.lng));
      });
    } catch {
      if (controller.signal.aborted) return;
      setControlStatus({
        kind: 'error',
        message: t('map.searchUnavailable'),
      });
    } finally {
      if (searchAbortRef.current === controller) searchAbortRef.current = null;
    }
  };

  const locate = (): Promise<void> => {
    locationRequestRef.current?.invalidate();

    return new Promise((resolve) => {
      let active = true;
      const request: PendingLocationRequest = {
        invalidate: () => {
          if (!active) return;
          active = false;
          resolve();
        },
      };
      locationRequestRef.current = request;
      const finish = (effect: () => void): void => {
        if (!active || locationRequestRef.current !== request) return;
        effect();
        locationRequestRef.current = null;
        active = false;
        resolve();
      };
      const geolocation = typeof navigator !== 'undefined'
        ? navigator.geolocation
        : undefined;

      if (!geolocation) {
        finish(() => setControlStatus({
          kind: 'error',
          message: t('map.locationUnavailable'),
        }));
        return;
      }
      setControlStatus(undefined);
      geolocation.getCurrentPosition(({ coords }) => {
        finish(() => {
          const span = 0.02;
          updateParams((next) => {
            next.delete('cursor');
            next.set('west', String(coords.longitude - span));
            next.set('east', String(coords.longitude + span));
            next.set('south', String(coords.latitude - span));
            next.set('north', String(coords.latitude + span));
            next.set('lat', String(coords.latitude));
            next.set('lng', String(coords.longitude));
          });
        });
      }, () => {
        finish(() => setControlStatus({
          kind: 'error',
          message: t('map.locationUnavailable'),
        }));
      }, { enableHighAccuracy: false, maximumAge: 30_000, timeout: 10_000 });
    });
  };

  const remoteLoading = loadFromApi && remote.isLoading;
  const remoteError = loadFromApi && remote.isError;
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  const mapLoading = state === 'loading' || remoteLoading;
  const mapError = state === 'error' || remoteError;
  const mapEmpty = !mapLoading && !mapError && (
    state === 'empty'
    || (loadFromApi && !remote.isLoading && !remote.data?.items.length)
  );

  return (
    <section
      className={`map-route${mapLoading ? ' map-route--busy' : ''}${mapError ? ' map-route--data-error' : ''}`}
      data-lens-mode={!mapLoading && !mapError
        ? selected ? 'explicit' : momentGroup ? 'group' : undefined
        : undefined}
      aria-busy={mapLoading}
    >
      <h1 className="map-route__title">{t('map.title')}</h1>
      <MapControls
        visibility={params.get('visibility') ?? ''}
        searchOpen={searchOpen}
        {...(controlStatus ? { status: controlStatus } : {})}
        onDismissStatus={() => setControlStatus(undefined)}
        onSearch={search}
        onSearchOpenChange={(open) => {
          if (!open) {
            searchAbortRef.current?.abort();
            searchAbortRef.current = null;
          }
          updateParams((next) => {
            if (open) next.set('search', 'open');
            else next.delete('search');
          });
        }}
        onLocate={locate}
        onVisibilityChange={(value) => {
          updateParams((next) => {
            if (value) next.set('visibility', value);
            else next.delete('visibility');
            next.delete('cursor');
          });
        }}
      />
      <MapCanvas
        items={visibleItems}
        viewport={viewport}
        {...(explicitSelected ? { selectedId: explicitSelected.id } : {})}
        onActivate={activateMoment}
        onDismiss={dismissMoment}
        onSelectedPointChange={setChronoAnchor}
        {...(!freezeViewport
          ? {
              onViewportChange: (bounds: MapViewportBounds) => {
                updateParams((next) => {
                  next.delete('cursor');
                  for (const [key, value] of Object.entries(bounds)) {
                    next.set(key, String(value));
                  }
                  next.set('lat', String((bounds.south + bounds.north) / 2));
                  next.set('lng', String((bounds.west + bounds.east) / 2));
                }, true);
              },
            }
          : {})}
        onSelect={(id) => {
          const moveFocusToLens = document.activeElement instanceof HTMLElement
            && document.activeElement.dataset['footprintId'] === id;
          semanticReturnFocusRef.current = moveFocusToLens ? id : null;
        }}
      />
      {mapLoading ? <MapStageStatus kind="loading" /> : null}
      {mapError ? <MapStageStatus kind="error" offline={offline} onRetry={retry} /> : null}
      {mapEmpty ? <MapStageStatus kind="empty" /> : null}
      {momentGroup && sheet === 'group' && !mapLoading && !mapError ? (
        <MomentDeck
          items={momentGroup.items}
          {...(momentGroup.anchor ? { anchor: momentGroup.anchor } : {})}
          onClose={dismissMoment}
          onExpandMap={expandMomentGroup}
          onOpen={(item) => {
            const selectedItem = visibleItems.find((candidate) => candidate.id === item.id);
            if (selectedItem) openMoment(selectedItem, momentGroup.anchor);
          }}
        />
      ) : null}
      {selected && !mapLoading && !mapError ? (
        <ChronoLens
          key={selected.id}
          item={selected}
          mode="explicit"
          {...(chronoAnchor ? { anchor: chronoAnchor } : {})}
          onClose={() => {
            const focusId = semanticReturnFocusRef.current === selected.id
              ? selected.id
              : null;
            dismissMoment();
            window.setTimeout(() => {
              const focusTarget = focusId
                ? document.querySelector<HTMLElement>(`[data-footprint-id="${focusId}"]`)
                : document.querySelector<HTMLElement>('.map-canvas__viewport');
              focusTarget?.focus({ preventScroll: true });
              semanticReturnFocusRef.current = null;
            }, 0);
          }}
        />
      ) : null}
    </section>
  );
}
