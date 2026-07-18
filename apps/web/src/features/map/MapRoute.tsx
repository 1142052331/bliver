import { placeSearchResponse } from '@bliver/contracts';
import { Button, Surface } from '@bliver/ui';
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import {
  MapCanvas,
  type MapCanvasItem,
  type MapViewportBounds,
} from './MapCanvas.js';
import { MapControls, type MapControlStatus } from './MapControls.js';
import { useMapFootprintsQuery } from './api.js';
import { connectMapRealtime } from './realtime.js';
import './map.css';

export interface MapItem extends MapCanvasItem {
  readonly visibility: 'public' | 'friends' | 'private';
  readonly locationPrecision: 'precise' | 'approximate';
  readonly publishedAt: string;
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
}: MapRouteProps) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const searchAbortRef = useRef<AbortController | null>(null);
  const locationRequestRef = useRef<PendingLocationRequest | null>(null);
  const [controlStatus, setControlStatus] = useState<MapControlStatus>();

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
  const searchOpen = params.get('search') === 'open';
  const matchedSelected = useMemo(
    () => visibleItems.find((item) => item.id === selectedId),
    [visibleItems, selectedId],
  );
  const selected = selectedId
    ? matchedSelected
    : params.get('sheet') === 'closed'
      ? undefined
      : visibleItems[0];

  useEffect(() => {
    const waitingForRemoteItems = loadFromApi && remote.isLoading;
    if (selectedId && !waitingForRemoteItems && !matchedSelected) {
      const next = new URLSearchParams(params);
      next.delete('footprint');
      next.set('sheet', 'closed');
      setParams(next, { replace: true });
    }
  }, [loadFromApi, matchedSelected, params, remote.isLoading, selectedId, setParams]);
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

  const search = async (query: string): Promise<void> => {
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setControlStatus(undefined);
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set('search', 'open');
      return next;
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
      setParams((current) => {
        const next = new URLSearchParams(current);
        next.delete('cursor');
        next.set('west', String(first.lng - span));
        next.set('east', String(first.lng + span));
        next.set('south', String(first.lat - span));
        next.set('north', String(first.lat + span));
        next.set('lat', String(first.lat));
        next.set('lng', String(first.lng));
        return next;
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
          setParams((current) => {
            const next = new URLSearchParams(current);
            next.delete('cursor');
            next.set('west', String(coords.longitude - span));
            next.set('east', String(coords.longitude + span));
            next.set('south', String(coords.latitude - span));
            next.set('north', String(coords.latitude + span));
            next.set('lat', String(coords.latitude));
            next.set('lng', String(coords.longitude));
            return next;
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

  if (state === 'loading' || remoteLoading) {
    return (
      <section className="map-route" aria-busy="true">
        <div role="status">{t('map.loading')}</div>
      </section>
    );
  }

  if (state === 'error' || remoteError) {
    return (
      <section className="map-route map-route--state">
        <Surface>
          <h1>{offline ? t('map.offlineTitle') : t('map.unavailableTitle')}</h1>
          <p>{offline ? t('map.offlineBody') : t('map.unavailableBody')}</p>
          <Button onClick={retry}>{t('common.retry')}</Button>
        </Surface>
      </section>
    );
  }

  return (
    <section className="map-route">
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
          setParams((current) => {
            const next = new URLSearchParams(current);
            if (open) next.set('search', 'open');
            else next.delete('search');
            return next;
          });
        }}
        onLocate={locate}
        onVisibilityChange={(value) => {
          setParams((current) => {
            const next = new URLSearchParams(current);
            if (value) next.set('visibility', value);
            else next.delete('visibility');
            next.delete('cursor');
            return next;
          });
        }}
      />
      <MapCanvas
        items={visibleItems}
        viewport={viewport}
        {...(selected ? { selectedId: selected.id } : {})}
        onViewportChange={(bounds) => {
          setParams((current) => {
            const next = new URLSearchParams(current);
            next.delete('cursor');
            for (const [key, value] of Object.entries(bounds)) {
              next.set(key, String(value));
            }
            next.set('lat', String((bounds.south + bounds.north) / 2));
            next.set('lng', String((bounds.west + bounds.east) / 2));
            return next;
          }, { replace: true });
        }}
        onSelect={(id) => {
          const item = visibleItems.find((candidate) => candidate.id === id);
          setParams((current) => {
            const next = new URLSearchParams(current);
            next.set('footprint', id);
            next.set('sheet', 'preview');
            if (item) {
              next.set('lat', String(item.displayPoint.lat));
              next.set('lng', String(item.displayPoint.lng));
            }
            return next;
          });
        }}
      />
      {state === 'empty' || (
        loadFromApi && !remote.isLoading && !remote.data?.items.length
      ) ? (
        <Surface className="map-route__empty">
          <h2>{t('map.emptyTitle')}</h2>
          <p>{t('map.emptyBody')}</p>
        </Surface>
      ) : null}
      {selected ? (
        <Surface className="map-route__preview" aria-label={t('map.preview')}>
          <strong>{selected.author.name}</strong>
          <p>
            {selected.visibility === 'public'
              ? t('map.public')
              : selected.visibility === 'friends'
                ? t('map.friendsOnly')
                : t('map.onlyYou')}
          </p>
          <p>
            {selected.locationPrecision === 'precise'
              ? t('map.preciseLocation')
              : t('map.approximateLocation')}
          </p>
          <Link to={`/footprints/${selected.id}`}>{t('map.openFootprint')}</Link>
        </Surface>
      ) : null}
    </section>
  );
}
