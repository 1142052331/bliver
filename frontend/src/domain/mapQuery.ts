export type MapScope = 'smart' | 'region' | 'country' | 'global';
export type MapRelationship = 'all' | 'self' | 'friends' | 'public';
export type MapPeriod = '24h' | '7d' | 'year';
export type MapContent = 'all' | 'photo' | 'unread';

export interface MapQuery {
  scope: MapScope;
  relationship: MapRelationship;
  period: MapPeriod;
  content: MapContent;
  query: string;
  countryCode?: string;
  regionCode?: string;
}

export const DEFAULT_MAP_QUERY: MapQuery = {
  scope: 'smart',
  relationship: 'all',
  period: '7d',
  content: 'all',
  query: '',
};

const VALUES = {
  scope: new Set<MapScope>(['smart', 'region', 'country', 'global']),
  relationship: new Set<MapRelationship>(['all', 'self', 'friends', 'public']),
  period: new Set<MapPeriod>(['24h', '7d', 'year']),
  content: new Set<MapContent>(['all', 'photo', 'unread']),
};

const MAP_PARAM_KEYS = ['scope', 'relationship', 'period', 'content', 'q', 'country', 'region'];

function readValue<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: Set<T>,
  fallback: T,
): T {
  const value = params.get(key) as T | null;
  return value && allowed.has(value) ? value : fallback;
}

function readCode(params: URLSearchParams, key: string, maxLength: number) {
  return (params.get(key) || '').trim().slice(0, maxLength).toUpperCase();
}

export function parseMapQuery(
  params: URLSearchParams,
  { isAuthenticated = true }: { isAuthenticated?: boolean } = {},
): MapQuery {
  let scope = readValue(params, 'scope', VALUES.scope, DEFAULT_MAP_QUERY.scope);
  const countryCode = readCode(params, 'country', 8);
  const regionCode = readCode(params, 'region', 40);
  if ((scope === 'region' && !regionCode) || (scope === 'country' && !countryCode)) {
    scope = 'smart';
  }

  let content = readValue(params, 'content', VALUES.content, DEFAULT_MAP_QUERY.content);
  if (!isAuthenticated && content === 'unread') content = 'all';

  const result: MapQuery = {
    scope,
    relationship: readValue(
      params,
      'relationship',
      VALUES.relationship,
      DEFAULT_MAP_QUERY.relationship,
    ),
    period: readValue(params, 'period', VALUES.period, DEFAULT_MAP_QUERY.period),
    content,
    query: (params.get('q') || '').trim().slice(0, 80),
  };
  if (scope === 'region') {
    result.regionCode = regionCode;
    if (countryCode) result.countryCode = countryCode;
  } else if (scope === 'country') {
    result.countryCode = countryCode;
  }
  return result;
}

export function serializeMapQuery(query: MapQuery) {
  const params = new URLSearchParams();
  for (const key of ['scope', 'relationship', 'period', 'content'] as const) {
    if (query[key] !== DEFAULT_MAP_QUERY[key]) params.set(key, query[key]);
  }
  if (query.scope === 'region') {
    if (query.countryCode) params.set('country', query.countryCode);
    if (query.regionCode) params.set('region', query.regionCode);
  } else if (query.scope === 'country' && query.countryCode) {
    params.set('country', query.countryCode);
  }
  const search = query.query.trim().slice(0, 80);
  if (search) params.set('q', search);
  return params;
}

export function mergeCanonicalMapParams(current: URLSearchParams, query: MapQuery) {
  const result = new URLSearchParams(current);
  for (const key of MAP_PARAM_KEYS) result.delete(key);
  serializeMapQuery(query).forEach((value, key) => result.set(key, value));
  return result;
}

export function mapQueryKey(query: MapQuery) {
  return ['footprints', 'map', query] as const;
}
