export const OPENFREEMAP_STYLE_ORIGIN = 'https://tiles.openfreemap.org';
export const MAP_PROVIDER_EMERGENCY_MAX_MS = 7 * 24 * 60 * 60 * 1_000;

export interface MapProviderAttribution {
  readonly label: string;
  readonly href: string;
}

export interface MapProviderReleaseInput {
  readonly styleUrl?: string;
  readonly attributionJson?: string;
  readonly emergencyApproved?: string;
  readonly emergencyExpiresAt?: string;
}

export interface VerifiedMapProvider {
  readonly mode: 'same-origin' | 'openfreemap-emergency';
  readonly styleUrl: string;
  readonly attributions: readonly MapProviderAttribution[];
}

function parseAttributionHref(value: string): string {
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('map provider attribution href must be root-relative or HTTPS');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('map provider attribution href must be root-relative or HTTPS');
  }
  return value;
}

export function parseMapProviderAttributions(
  raw: string | undefined,
): readonly MapProviderAttribution[] {
  if (!raw?.trim()) {
    throw new Error('VITE_MAP_ATTRIBUTION_JSON is required');
  }

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
      throw new Error('map provider attribution entries must be objects');
    }
    const record = entry as Record<string, unknown>;
    const label = typeof record['label'] === 'string'
      ? record['label'].trim()
      : '';
    const href = typeof record['href'] === 'string'
      ? record['href'].trim()
      : '';
    if (!label || label.length > 120 || !href) {
      throw new Error('map provider attribution entries require label and href');
    }
    return { label, href: parseAttributionHref(href) };
  });
}

function isOpenFreeMapStyle(styleUrl: string): boolean {
  try {
    const parsed = new URL(styleUrl);
    return parsed.origin === OPENFREEMAP_STYLE_ORIGIN;
  } catch {
    return false;
  }
}

export function verifyMapProviderRelease(
  input: MapProviderReleaseInput,
  now = new Date(),
): VerifiedMapProvider {
  const styleUrl = input.styleUrl?.trim() ?? '';
  if (styleUrl.startsWith('/') && !styleUrl.startsWith('//')) {
    return {
      mode: 'same-origin',
      styleUrl,
      attributions: parseMapProviderAttributions(input.attributionJson),
    };
  }

  if (styleUrl && !isOpenFreeMapStyle(styleUrl)) {
    throw new Error('production VITE_MAP_STYLE_URL must be root-relative');
  }
  if (input.emergencyApproved !== '1') {
    throw new Error(
      'OpenFreeMap fallback requires MAP_PROVIDER_EMERGENCY=1',
    );
  }

  const expiresAt = new Date(input.emergencyExpiresAt ?? '');
  const remainingMs = expiresAt.getTime() - now.getTime();
  if (!Number.isFinite(expiresAt.getTime()) || remainingMs <= 0) {
    throw new Error('MAP_PROVIDER_EMERGENCY_EXPIRES_AT must be in the future');
  }
  if (remainingMs > MAP_PROVIDER_EMERGENCY_MAX_MS) {
    throw new Error('map provider emergency approval may not exceed 7 days');
  }

  return {
    mode: 'openfreemap-emergency',
    styleUrl: styleUrl || `${OPENFREEMAP_STYLE_ORIGIN}/styles/positron`,
    attributions: [],
  };
}
