export const DEFAULT_MAP_STYLE_URL =
  'https://tiles.openfreemap.org/styles/liberty';

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
