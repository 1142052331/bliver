// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MapEventHandler = (event?: unknown) => void;

interface MockBounds {
  readonly getEast: () => number;
  readonly getNorth: () => number;
  readonly getSouth: () => number;
  readonly getWest: () => number;
}

const maplibre = vi.hoisted(() => {
  let constructorError: Error | undefined;
  const instances: MockMap[] = [];
  const constructorSpy = vi.fn();
  const sourceSetData = vi.fn();

  class MockMap {
    readonly handlers = new globalThis.Map<string, Set<MapEventHandler>>();
    readonly source = {
      getClusterExpansionZoom: vi.fn(async () => 13),
      setData: sourceSetData,
    };
    readonly addLayer = vi.fn();
    readonly addSource = vi.fn();
    readonly addControl = vi.fn();
    readonly easeTo = vi.fn();
    readonly fitBounds = vi.fn();
    readonly getBounds = vi.fn((): MockBounds => ({
      getEast: () => 122,
      getNorth: () => 32,
      getSouth: () => 30,
      getWest: () => 120,
    }));
    readonly getCanvas = vi.fn(() => ({ style: {} }));
    readonly getLayer = vi.fn(() => undefined);
    readonly getSource = vi.fn(() => this.source);
    readonly queryRenderedFeatures = vi.fn(() => []);
    readonly remove = vi.fn();
    readonly removeLayer = vi.fn();
    readonly removeSource = vi.fn();
    readonly resize = vi.fn();

    constructor(options: unknown) {
      constructorSpy(options);
      if (constructorError) throw constructorError;
      instances.push(this);
    }

    readonly on = vi.fn((event: string, layerOrHandler: string | MapEventHandler, handler?: MapEventHandler) => {
      const key = typeof layerOrHandler === 'string' ? `${event}:${layerOrHandler}` : event;
      const listener = typeof layerOrHandler === 'string' ? handler : layerOrHandler;
      if (listener) {
        const listeners = this.handlers.get(key) ?? new Set<MapEventHandler>();
        listeners.add(listener);
        this.handlers.set(key, listeners);
      }
      return this;
    });

    readonly off = vi.fn((event: string, layerOrHandler: string | MapEventHandler, handler?: MapEventHandler) => {
      const key = typeof layerOrHandler === 'string' ? `${event}:${layerOrHandler}` : event;
      const listener = typeof layerOrHandler === 'string' ? handler : layerOrHandler;
      if (listener) this.handlers.get(key)?.delete(listener);
      return this;
    });

    emit(event: string, payload?: unknown) {
      for (const listener of this.handlers.get(event) ?? []) listener(payload);
    }

    emitLayer(event: string, layer: string, payload?: unknown) {
      for (const listener of this.handlers.get(`${event}:${layer}`) ?? []) listener(payload);
    }
  }

  class MockNavigationControl {}

  return {
    constructorSpy,
    instances,
    MockMap,
    MockNavigationControl,
    reset() {
      constructorError = undefined;
      constructorSpy.mockClear();
      sourceSetData.mockClear();
      instances.length = 0;
    },
    setConstructorError(error: Error | undefined) {
      constructorError = error;
    },
    sourceSetData,
  };
});

vi.mock('maplibre-gl', () => ({
  default: {
    Map: maplibre.MockMap,
    NavigationControl: maplibre.MockNavigationControl,
    supported: () => true,
  },
  Map: maplibre.MockMap,
  NavigationControl: maplibre.MockNavigationControl,
  supported: () => true,
}));

import { MapCanvas } from '../MapCanvas.js';
import { BliverI18nProvider } from '../../../i18n/I18nProvider.js';
import { createBliverI18n } from '../../../i18n/i18n.js';

const firstItem = {
  id: 'footprint-a',
  author: { name: 'Aster' },
  displayPoint: { lat: 31.23, lng: 121.47 },
};

const secondItem = {
  id: 'footprint-b',
  author: { name: 'Mori' },
  displayPoint: { lat: 35.68, lng: 139.76 },
};

type MapCanvasProps = ComponentProps<typeof MapCanvas>;

function renderMapCanvas(props: MapCanvasProps) {
  const instance = createBliverI18n('en');
  const result = render(
    <BliverI18nProvider instance={instance}>
      <MapCanvas {...props} />
    </BliverI18nProvider>,
  );

  return {
    ...result,
    instance,
    rerenderMap(nextProps: MapCanvasProps) {
      result.rerender(
        <BliverI18nProvider instance={instance}>
          <MapCanvas {...nextProps} />
        </BliverI18nProvider>,
      );
    },
  };
}

function setReducedMotion(matches: boolean) {
  let currentMatches = matches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query = {
    addEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
      if (event === 'change') listeners.add(listener);
    }),
    get matches() {
      return currentMatches;
    },
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    removeEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
      if (event === 'change') listeners.delete(listener);
    }),
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue(query),
    writable: true,
  });

  return {
    change(nextMatches: boolean) {
      currentMatches = nextMatches;
      const event = { matches: nextMatches } as MediaQueryListEvent;
      for (const listener of listeners) listener(event);
    },
  };
}

describe('MapCanvas MapLibre runtime', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    maplibre.reset();
    setReducedMotion(false);
  });

  afterEach(() => vi.useRealTimers());

  it('owns the MapLibre lifecycle, synchronizes bounds, and reports camera changes', async () => {
    const onViewportChange = vi.fn();
    const resizeDisconnect = vi.fn();
    const resizeObserve = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      readonly disconnect = resizeDisconnect;
      readonly observe = resizeObserve;
      readonly unobserve = vi.fn();
    });
    const initialViewport = { west: 120, south: 30, east: 122, north: 32 };
    const { rerenderMap, unmount } = renderMapCanvas({
      items: [firstItem],
      onViewportChange,
      viewport: initialViewport,
    });

    await waitFor(() => expect(maplibre.constructorSpy).toHaveBeenCalledOnce());
    expect(maplibre.constructorSpy).toHaveBeenCalledWith(expect.objectContaining({
      locale: {
        'Map.Title': 'Interactive footprint map',
        'NavigationControl.ZoomIn': 'Zoom in',
        'NavigationControl.ZoomOut': 'Zoom out',
      },
      renderWorldCopies: false,
      style: 'https://tiles.openfreemap.org/styles/liberty',
    }));
    expect(maplibre.constructorSpy.mock.calls[0]?.[0]).not.toHaveProperty('maxBounds');

    const runtime = maplibre.instances[0];
    expect(runtime).toBeDefined();
    act(() => runtime?.emit('load'));
    expect(runtime?.fitBounds).not.toHaveBeenCalled();

    const geoJsonSource = runtime?.addSource.mock.calls.find((call) => {
      const source = call[1] as { readonly type?: string } | undefined;
      return source?.type === 'geojson';
    });
    expect(geoJsonSource?.[1]).toEqual(expect.objectContaining({
      cluster: true,
      data: expect.objectContaining({
        features: [expect.objectContaining({
          geometry: { coordinates: [121.47, 31.23], type: 'Point' },
          properties: expect.objectContaining({ id: 'footprint-a' }),
          type: 'Feature',
        })],
        type: 'FeatureCollection',
      }),
      type: 'geojson',
    }));

    rerenderMap({
      items: [firstItem],
      onViewportChange,
      viewport: { west: 110, south: 20, east: 111, north: 21 },
    });
    expect(runtime?.fitBounds).toHaveBeenLastCalledWith(
      [[110, 20], [111, 21]],
      expect.objectContaining({ animate: false }),
    );
    expect(onViewportChange).not.toHaveBeenCalled();

    act(() => runtime?.emit('moveend'));
    expect(onViewportChange).toHaveBeenLastCalledWith(initialViewport);

    const fitCountAfterViewportReport = runtime?.fitBounds.mock.calls.length;
    rerenderMap({
      items: [firstItem],
      onViewportChange,
      viewport: initialViewport,
    });
    expect(runtime?.fitBounds).toHaveBeenCalledTimes(fitCountAfterViewportReport ?? 0);

    unmount();
    expect(resizeObserve).toHaveBeenCalledOnce();
    expect(resizeDisconnect).toHaveBeenCalledOnce();
    expect(runtime?.off).toHaveBeenCalledWith('load', expect.any(Function));
    expect(runtime?.off).toHaveBeenCalledWith(
      'click',
      'bliver-footprint-points',
      expect.any(Function),
    );
    expect(runtime?.remove).toHaveBeenCalledOnce();
  });

  it('updates GeoJSON when footprints or selection change', async () => {
    const { rerenderMap } = renderMapCanvas({ items: [firstItem] });

    await waitFor(() => expect(maplibre.constructorSpy).toHaveBeenCalledOnce());
    act(() => maplibre.instances[0]?.emit('load'));
    maplibre.sourceSetData.mockClear();

    rerenderMap({
      items: [firstItem, secondItem],
      selectedId: secondItem.id,
    });

    expect(maplibre.sourceSetData).toHaveBeenCalledOnce();
    expect(maplibre.sourceSetData).toHaveBeenCalledWith({
      type: 'FeatureCollection',
      features: [
        expect.objectContaining({
          id: firstItem.id,
          properties: expect.objectContaining({ selected: false }),
        }),
        expect.objectContaining({
          id: secondItem.id,
          properties: expect.objectContaining({ selected: true }),
        }),
      ],
    });
  });

  it('keeps reported camera bounds inside the single supported world', async () => {
    const onViewportChange = vi.fn();
    renderMapCanvas({ items: [firstItem], onViewportChange });

    await waitFor(() => expect(maplibre.constructorSpy).toHaveBeenCalledOnce());
    const runtime = maplibre.instances[0];
    runtime?.getBounds.mockReturnValue({
      getEast: () => 181,
      getNorth: () => 90,
      getSouth: () => -90,
      getWest: () => -181,
    });
    act(() => runtime?.emit('load'));
    act(() => runtime?.emit('moveend'));

    expect(onViewportChange).toHaveBeenCalledWith({
      east: 180,
      north: 85.051129,
      south: -85.051129,
      west: -180,
    });
  });

  it('reports the moveend produced by programmatic cluster expansion', async () => {
    const onViewportChange = vi.fn();
    renderMapCanvas({ items: [firstItem, secondItem], onViewportChange });

    await waitFor(() => expect(maplibre.constructorSpy).toHaveBeenCalledOnce());
    const runtime = maplibre.instances[0];
    act(() => runtime?.emit('load'));
    act(() => runtime?.emitLayer('click', 'bliver-footprint-clusters', {
      features: [{
        geometry: { coordinates: [121.47, 31.23], type: 'Point' },
        properties: { cluster_id: 7 },
      }],
    }));

    await waitFor(() => expect(runtime?.easeTo).toHaveBeenCalledWith({
      center: [121.47, 31.23],
      duration: 350,
      zoom: 13,
    }));
    act(() => runtime?.emit('moveend'));

    expect(onViewportChange).toHaveBeenCalledWith({
      east: 122,
      north: 32,
      south: 30,
      west: 120,
    });
  });

  it('rebuilds native map and zoom controls for all three product languages', async () => {
    const { instance } = renderMapCanvas({ items: [firstItem] });

    await waitFor(() => expect(maplibre.constructorSpy).toHaveBeenCalledOnce());
    const englishRuntime = maplibre.instances[0];
    act(() => englishRuntime?.emit('load'));
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-map-ready', 'true');

    await act(async () => instance.changeLanguage('zh-CN'));
    await waitFor(() => expect(maplibre.constructorSpy).toHaveBeenCalledTimes(2));
    expect(englishRuntime?.remove).toHaveBeenCalledOnce();
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-map-ready', 'false');
    expect(maplibre.constructorSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({
      locale: {
        'Map.Title': '互动足迹地图',
        'NavigationControl.ZoomIn': '放大地图',
        'NavigationControl.ZoomOut': '缩小地图',
      },
    }));

    const chineseRuntime = maplibre.instances[1];
    act(() => chineseRuntime?.emit('load'));
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-map-ready', 'true');

    await act(async () => instance.changeLanguage('ja'));
    await waitFor(() => expect(maplibre.constructorSpy).toHaveBeenCalledTimes(3));
    expect(chineseRuntime?.remove).toHaveBeenCalledOnce();
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-map-ready', 'false');
    expect(maplibre.constructorSpy).toHaveBeenNthCalledWith(3, expect.objectContaining({
      locale: {
        'Map.Title': 'インタラクティブ足跡マップ',
        'NavigationControl.ZoomIn': '地図を拡大',
        'NavigationControl.ZoomOut': '地図を縮小',
      },
    }));
    expect(screen.getByLabelText('地図データの帰属表示')).toBeInTheDocument();
  });

  it('uses forest, ring shape, and scale for an ordinary selected footprint', async () => {
    renderMapCanvas({ items: [firstItem], selectedId: firstItem.id });

    await waitFor(() => expect(maplibre.constructorSpy).toHaveBeenCalledOnce());
    const runtime = maplibre.instances[0];
    act(() => runtime?.emit('load'));
    const pointLayer = runtime?.addLayer.mock.calls.find((call) => {
      const layer = call[0] as { readonly id?: string } | undefined;
      return layer?.id === 'bliver-footprint-points';
    })?.[0] as { readonly paint?: Record<string, unknown> } | undefined;

    expect(pointLayer?.paint?.['circle-color']).toEqual([
      'case',
      ['boolean', ['get', 'selected'], false],
      '#173b31',
      '#a9c9bf',
    ]);
    expect(pointLayer?.paint?.['circle-radius']).toEqual([
      'case',
      ['boolean', ['get', 'selected'], false],
      11,
      8,
    ]);
    expect(pointLayer?.paint?.['circle-stroke-width']).toEqual([
      'case',
      ['boolean', ['get', 'selected'], false],
      4,
      2,
    ]);
    expect(JSON.stringify(pointLayer)).not.toContain('#c54b36');
  });

  it('keeps every canvas footprint in an actionable semantic DOM list', async () => {
    const onSelect = vi.fn();
    renderMapCanvas({ items: [firstItem, secondItem], onSelect, selectedId: 'footprint-b' });

    await waitFor(() => expect(maplibre.constructorSpy).toHaveBeenCalledOnce());
    expect(screen.getByTestId('map-footprint-list')).toBeInTheDocument();
    const semanticItems = screen.getAllByTestId('map-footprint-item');
    expect(semanticItems).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Aster/ })).toBe(semanticItems[0]);
    expect(screen.getByRole('button', { name: /Mori/ })).toBe(semanticItems[1]);
    expect(semanticItems[0]).toHaveAttribute('aria-pressed', 'false');
    expect(semanticItems[1]).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(semanticItems[0] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith('footprint-a');
  });

  it('uses the static geographic fallback for reduced motion without losing the semantic list', () => {
    setReducedMotion(true);
    renderMapCanvas({ items: [firstItem] });

    expect(screen.getByTestId('map-static-fallback')).toBeVisible();
    expect(screen.getByTestId('map-footprint-list')).toBeInTheDocument();
    expect(screen.getAllByTestId('map-footprint-item')).toHaveLength(1);
    expect(maplibre.constructorSpy).not.toHaveBeenCalled();
  });

  it('tracks dynamic reduced motion, reports readiness accurately, and restores current bounds', async () => {
    const motion = setReducedMotion(false);
    renderMapCanvas({ items: [firstItem] });

    await waitFor(() => expect(maplibre.constructorSpy).toHaveBeenCalledOnce());
    const firstRuntime = maplibre.instances[0];
    firstRuntime?.getBounds.mockReturnValue({
      getEast: () => 141,
      getNorth: () => 36,
      getSouth: () => 34,
      getWest: () => 139,
    });
    act(() => firstRuntime?.emit('load'));
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-map-ready', 'true');

    act(() => motion.change(true));
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-map-ready', 'false');
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-mode', 'static');
    expect(firstRuntime?.remove).toHaveBeenCalledOnce();

    act(() => motion.change(false));
    await waitFor(() => expect(maplibre.constructorSpy).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-map-ready', 'false');
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-mode', 'initializing');
    expect(maplibre.constructorSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({
      bounds: [[139, 34], [141, 36]],
      fitBoundsOptions: { animate: false },
    }));

    act(() => maplibre.instances[1]?.emit('load'));
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-map-ready', 'true');
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-mode', 'interactive');
  });

  it('renders every provider attribution as an operable link', () => {
    renderMapCanvas({ items: [firstItem] });

    fireEvent.click(screen.getByLabelText('Map data attribution'));
    expect(screen.getByRole('link', { name: 'OpenFreeMap' }))
      .toHaveAttribute('href', 'https://openfreemap.org/');
    expect(screen.getByRole('link', { name: 'OpenMapTiles' }))
      .toHaveAttribute('href', 'https://www.openmaptiles.org/');
    expect(screen.getByRole('link', { name: 'OpenStreetMap contributors' }))
      .toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
  });

  it('falls back when MapLibre cannot initialize WebGL and keeps footprints operable', async () => {
    const onSelect = vi.fn();
    maplibre.setConstructorError(new Error('WebGL unavailable'));
    renderMapCanvas({ items: [firstItem], onSelect });

    expect(await screen.findByTestId('map-static-fallback')).toBeVisible();
    const semanticItem = screen.getByTestId('map-footprint-item');
    expect(screen.getByRole('button', { name: /Aster/ })).toBe(semanticItem);
    fireEvent.click(semanticItem);
    expect(onSelect).toHaveBeenCalledWith('footprint-a');
  });

  it('allows a transient initialization error to recover when load follows within 500ms', () => {
    vi.useFakeTimers();
    renderMapCanvas({ items: [firstItem] });
    expect(maplibre.constructorSpy).toHaveBeenCalledOnce();
    const runtime = maplibre.instances[0];

    act(() => {
      runtime?.emit('error', { error: new Error('style resource retrying') });
      vi.advanceTimersByTime(499);
    });
    expect(screen.queryByTestId('map-static-fallback')).not.toBeInTheDocument();

    act(() => {
      runtime?.emit('load');
      vi.advanceTimersByTime(1_000);
    });

    expect(screen.queryByTestId('map-static-fallback')).not.toBeInTheDocument();
    expect(runtime?.remove).not.toHaveBeenCalled();
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-mode', 'interactive');
  });

  it('falls back when an initialization error does not recover within 500ms', () => {
    vi.useFakeTimers();
    renderMapCanvas({ items: [firstItem] });
    const runtime = maplibre.instances[0];

    act(() => {
      runtime?.emit('error', { error: new Error('style unavailable') });
      vi.advanceTimersByTime(499);
    });
    expect(screen.queryByTestId('map-static-fallback')).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));

    expect(screen.getByTestId('map-static-fallback')).toBeVisible();
    expect(runtime?.remove).toHaveBeenCalledOnce();
  });

  it('keeps a loaded map alive after one recoverable resource error', async () => {
    renderMapCanvas({ items: [firstItem] });
    await waitFor(() => expect(maplibre.constructorSpy).toHaveBeenCalledOnce());
    const runtime = maplibre.instances[0];
    act(() => runtime?.emit('load'));

    act(() => runtime?.emit('error', { error: new Error('one tile failed') }));

    expect(screen.queryByTestId('map-static-fallback')).not.toBeInTheDocument();
    expect(runtime?.remove).not.toHaveBeenCalled();
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-mode', 'interactive');
  });

  it('resets the loaded resource error streak after the map becomes idle', async () => {
    renderMapCanvas({ items: [firstItem] });
    await waitFor(() => expect(maplibre.constructorSpy).toHaveBeenCalledOnce());
    const runtime = maplibre.instances[0];
    act(() => runtime?.emit('load'));

    act(() => {
      runtime?.emit('error', { error: new Error('tile failed 1') });
      runtime?.emit('error', { error: new Error('tile failed 2') });
      runtime?.emit('idle');
      runtime?.emit('error', { error: new Error('tile failed after recovery 1') });
      runtime?.emit('error', { error: new Error('tile failed after recovery 2') });
    });

    expect(screen.queryByTestId('map-static-fallback')).not.toBeInTheDocument();
    expect(runtime?.remove).not.toHaveBeenCalled();
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-mode', 'interactive');
  });

  it('falls back and releases a loaded map after three consecutive resource errors', async () => {
    renderMapCanvas({ items: [firstItem] });
    await waitFor(() => expect(maplibre.constructorSpy).toHaveBeenCalledOnce());
    const runtime = maplibre.instances[0];
    act(() => runtime?.emit('load'));

    act(() => {
      runtime?.emit('error', { error: new Error('tile failed 1') });
      runtime?.emit('error', { error: new Error('tile failed 2') });
      runtime?.emit('error', { error: new Error('tile failed 3') });
    });

    expect(await screen.findByTestId('map-static-fallback')).toBeVisible();
    expect(runtime?.remove).toHaveBeenCalledOnce();
    expect(screen.getByTestId('map-footprint-item')).toBeEnabled();
  });
});
