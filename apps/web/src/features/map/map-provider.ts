import type { StyleSpecification } from 'maplibre-gl';

export const DEFAULT_MAP_STYLE_URL =
  'https://tiles.openfreemap.org/styles/positron';

const OPENFREEMAP_ORIGIN = 'https://tiles.openfreemap.org';

export interface MapAttribution {
  readonly label: string;
  readonly href: string;
}

export interface MapProviderConfig {
  readonly styleUrl: string;
  readonly attributions: readonly MapAttribution[];
}

export const DEFAULT_MAP_ATTRIBUTIONS: readonly MapAttribution[] = [
  { label: 'OpenFreeMap', href: 'https://openfreemap.org/' },
  { label: 'OpenMapTiles', href: 'https://www.openmaptiles.org/' },
  {
    label: 'OpenStreetMap contributors',
    href: 'https://www.openstreetmap.org/copyright',
  },
];

/**
 * Natural City uses the provider's vector data, but owns the visual treatment
 * of that data. Keeping this transformation in the MapLibre style pipeline
 * avoids applying a costly filter to the whole WebGL canvas and keeps labels
 * crisp in all three product languages.
 */
const NATURAL_CITY_COLORS = {
  paper: '#faf8f3',
  land: '#f4f6f2',
  residential: '#eef2ee',
  park: '#dfeae3',
  wood: '#d5e3da',
  water: '#c5d8d1',
  waterway: '#9fbfb2',
  building: '#e7eeea',
  buildingOutline: '#d5e1db',
  roadCasing: '#c7d4cd',
  roadMajor: '#e4ebe6',
  roadMinor: '#d2ddd6',
  roadPath: '#c8d7cf',
  railway: '#a7bab0',
  boundary: '#9cb6aa',
  ink: '#29493e',
  mutedInk: '#5d7068',
  waterInk: '#486b60',
} as const;

type StyleLayer = StyleSpecification['layers'][number];
type LayerRecord = Record<string, unknown>;

function layerRecord(value: unknown): LayerRecord {
  return (typeof value === 'object' && value !== null)
    ? value as LayerRecord
    : {};
}

function withPaint(layer: StyleLayer, patch: LayerRecord): StyleLayer {
  const current = layerRecord('paint' in layer ? layer.paint : undefined);
  return {
    ...layer,
    paint: { ...current, ...patch },
  } as StyleLayer;
}

function withLayout(layer: StyleLayer, patch: LayerRecord): StyleLayer {
  const current = layerRecord('layout' in layer ? layer.layout : undefined);
  return {
    ...layer,
    layout: { ...current, ...patch },
  } as StyleLayer;
}

function localeFamily(locale: string): 'en' | 'ja' | 'zh' {
  const normalized = locale.trim().toLowerCase();
  if (normalized.startsWith('ja')) return 'ja';
  if (normalized.startsWith('zh')) return 'zh';
  return 'en';
}

function localizedNameExpression(locale: string): readonly unknown[] {
  const fields = localeFamily(locale) === 'zh'
    ? ['name:zh-Hans', 'name:zh', 'name:nonlatin', 'name', 'name:latin', 'name_en']
    : localeFamily(locale) === 'ja'
      ? ['name:ja', 'name:nonlatin', 'name', 'name:latin', 'name_en']
      : ['name_en', 'name:latin', 'name', 'name:nonlatin'];

  return [
    'coalesce',
    ...fields.map((field) => ['get', field]),
  ];
}

function isLabelLayer(layer: StyleLayer): boolean {
  if (layer.type !== 'symbol') return false;
  const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined;
  if (
    sourceLayer !== 'place'
    && sourceLayer !== 'water_name'
    && sourceLayer !== 'waterway'
    && sourceLayer !== 'transportation_name'
    && sourceLayer !== 'aerodrome_label'
  ) return false;
  const id = layer.id.toLowerCase();
  if (id.includes('shield')) return false;
  return 'layout' in layer && layerRecord(layer.layout)['text-field'] !== undefined;
}

function rethemeLabelLayer(layer: StyleLayer, locale: string): StyleLayer {
  if (!isLabelLayer(layer)) return layer;

  const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined;
  const id = layer.id.toLowerCase();
  const place = sourceLayer === 'place';
  const water = sourceLayer === 'water_name' || sourceLayer === 'waterway';
  const road = sourceLayer === 'transportation_name';
  const color = place
    ? NATURAL_CITY_COLORS.ink
    : water
      ? NATURAL_CITY_COLORS.waterInk
      : NATURAL_CITY_COLORS.mutedInk;
  const opacity = place ? 0.94 : road ? 0.7 : 0.8;
  const nextLayout: LayerRecord = {
    'text-field': localizedNameExpression(locale),
  };

  // Road names are supporting context. Keep major streets legible while
  // reducing the visual competition from minor/path labels at city scale.
  if (id.includes('path')) nextLayout['text-size'] = 10;

  let next = withLayout(layer, nextLayout);
  next = withPaint(next, {
    'text-color': color,
    'text-halo-color': NATURAL_CITY_COLORS.paper,
    'text-halo-width': 1.25,
    'text-halo-blur': 0.25,
    'text-opacity': opacity,
  });

  if (place && 'layout' in next && layerRecord(next.layout)['icon-image'] !== undefined) {
    next = withPaint(next, { 'icon-opacity': 0.62 });
  }

  return next;
}

function rethemeFillLayer(layer: StyleLayer): StyleLayer {
  if (layer.type !== 'fill') return layer;
  const id = layer.id.toLowerCase();
  if (id === 'background') return layer;
  if (id === 'water' || id.includes('water')) {
    return withPaint(layer, {
      'fill-color': NATURAL_CITY_COLORS.water,
      'fill-opacity': 0.92,
    });
  }
  if (id.includes('park')) {
    return withPaint(layer, {
      'fill-color': NATURAL_CITY_COLORS.park,
      'fill-opacity': 0.82,
    });
  }
  if (id.includes('wood') || id.includes('landcover')) {
    return withPaint(layer, {
      'fill-color': NATURAL_CITY_COLORS.wood,
      'fill-opacity': 0.72,
    });
  }
  if (id.includes('building')) {
    return withPaint(layer, {
      'fill-color': NATURAL_CITY_COLORS.building,
      'fill-outline-color': NATURAL_CITY_COLORS.buildingOutline,
    });
  }
  if (id.includes('residential')) {
    return withPaint(layer, {
      'fill-color': NATURAL_CITY_COLORS.residential,
      'fill-opacity': 0.72,
    });
  }
  if (id.includes('aeroway') || id.includes('road_area') || id.includes('pier')) {
    return withPaint(layer, {
      'fill-color': NATURAL_CITY_COLORS.land,
      'fill-opacity': 0.72,
    });
  }
  return layer;
}

function rethemeLineLayer(layer: StyleLayer): StyleLayer {
  if (layer.type !== 'line') return layer;
  const id = layer.id.toLowerCase();
  if (id.includes('waterway')) {
    return withPaint(layer, {
      'line-color': NATURAL_CITY_COLORS.waterway,
      'line-opacity': 0.72,
    });
  }
  if (id.includes('boundary')) {
    return withPaint(layer, {
      'line-color': NATURAL_CITY_COLORS.boundary,
      'line-opacity': 0.48,
    });
  }
  if (id.includes('railway')) {
    return withPaint(layer, {
      'line-color': NATURAL_CITY_COLORS.railway,
      'line-opacity': 0.48,
    });
  }
  if (id.includes('casing')) {
    return withPaint(layer, {
      'line-color': NATURAL_CITY_COLORS.roadCasing,
      'line-opacity': 0.78,
    });
  }
  if (id.includes('motorway') || id.includes('major')) {
    return withPaint(layer, {
      'line-color': NATURAL_CITY_COLORS.roadMajor,
      'line-opacity': 0.9,
    });
  }
  if (id.includes('minor') || id.includes('service')) {
    return withPaint(layer, {
      'line-color': NATURAL_CITY_COLORS.roadMinor,
      'line-opacity': 0.76,
    });
  }
  if (id.includes('path') || id.includes('taxiway') || id.includes('runway')) {
    return withPaint(layer, {
      'line-color': NATURAL_CITY_COLORS.roadPath,
      'line-opacity': 0.62,
    });
  }
  return layer;
}

function reduceLabelDensity(layer: StyleLayer): StyleLayer {
  const minimumZoom: Record<string, number> = {
    'label_other': 9,
    'label_village': 10,
    'highway-name-minor': 15.5,
    'highway-name-path': 16,
    'railway_service': 17,
    'railway_service_dashline': 17,
  };
  const target = minimumZoom[layer.id];
  if (target === undefined || layer.minzoom === undefined || layer.minzoom >= target) {
    return layer;
  }
  return { ...layer, minzoom: target } as StyleLayer;
}

/** Returns a new style object with Natural City material tokens applied. */
export function createNaturalCityMapStyle(
  style: StyleSpecification,
  locale = 'en',
): StyleSpecification {
  return {
    ...style,
    transition: { duration: 160, delay: 0 },
    layers: style.layers.map((layer) => {
      const id = layer.id.toLowerCase();
      let next = layer;
      if (layer.type === 'background') {
        next = withPaint(layer, { 'background-color': NATURAL_CITY_COLORS.paper });
      } else {
        next = rethemeFillLayer(next);
        next = rethemeLineLayer(next);
        next = rethemeLabelLayer(next, locale);
      }
      if (id.includes('shield')) {
        next = withPaint(next, { 'icon-opacity': 0.58, 'text-opacity': 0.62 });
      }
      return reduceLabelDensity(next);
    }),
  };
}

function attributionHref(value: string): string {
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Map attribution links must be root-relative or HTTPS');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('Map attribution links must be root-relative or HTTPS');
  }
  return value;
}

export function parseMapAttributions(raw: string | undefined): readonly MapAttribution[] {
  if (!raw?.trim()) throw new Error('VITE_MAP_ATTRIBUTION_JSON is required');
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('VITE_MAP_ATTRIBUTION_JSON must be valid JSON');
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) {
    throw new Error('VITE_MAP_ATTRIBUTION_JSON must contain 1 to 8 entries');
  }
  return value.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error('Map attribution entries must be objects');
    }
    const record = entry as Record<string, unknown>;
    const label = typeof record['label'] === 'string'
      ? record['label'].trim()
      : '';
    const href = typeof record['href'] === 'string'
      ? record['href'].trim()
      : '';
    if (!label || label.length > 120 || !href) {
      throw new Error('Map attribution entries require label and href');
    }
    return { label, href: attributionHref(href) };
  });
}

export function resolveMapStyleUrl(
  configuredUrl = import.meta.env.VITE_MAP_STYLE_URL,
  currentPageUrl = typeof window === 'undefined'
    ? undefined
    : window.location.href,
): string {
  const value = configuredUrl?.trim();
  if (!value) return DEFAULT_MAP_STYLE_URL;

  try {
    const page = currentPageUrl ? new URL(currentPageUrl) : undefined;
    const resolved = new URL(value, page);
    const isCurrentOrigin = page !== undefined
      && page.origin !== 'null'
      && resolved.origin === page.origin;

    if (isCurrentOrigin || resolved.origin === OPENFREEMAP_ORIGIN) {
      return value;
    }
  } catch {
    // Invalid and context-free relative URLs are rejected below.
  }

  throw new Error(
    'VITE_MAP_STYLE_URL must use the current page origin or https://tiles.openfreemap.org',
  );
}

export function resolveMapProvider(
  configuredUrl = import.meta.env.VITE_MAP_STYLE_URL,
  configuredAttributions = import.meta.env.VITE_MAP_ATTRIBUTION_JSON,
  currentPageUrl = typeof window === 'undefined'
    ? undefined
    : window.location.href,
): MapProviderConfig {
  const styleUrl = resolveMapStyleUrl(configuredUrl, currentPageUrl);
  const isOpenFreeMap = new URL(styleUrl, currentPageUrl).origin
    === OPENFREEMAP_ORIGIN;
  return {
    styleUrl,
    attributions: isOpenFreeMap
      ? DEFAULT_MAP_ATTRIBUTIONS
      : parseMapAttributions(configuredAttributions),
  };
}
