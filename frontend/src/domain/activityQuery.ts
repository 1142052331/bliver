export type ActivityScope = 'smart' | 'region' | 'country' | 'global';

export interface ActivityQuery {
  scope: ActivityScope;
  countryCode?: string;
  regionCode?: string;
  limit: number;
}

export interface ActivityViewerContext {
  _id?: unknown;
  id?: unknown;
  role?: unknown;
  isAdmin?: unknown;
  user?: {
    _id?: unknown;
    id?: unknown;
    role?: unknown;
    isAdmin?: unknown;
  } | null;
}

export type ActivityViewer = string | ActivityViewerContext | null | undefined;

export const DEFAULT_ACTIVITY_QUERY: ActivityQuery = {
  scope: 'smart',
  limit: 20,
};

export function canonicalViewerIdentity(viewer: ActivityViewer = 'guest'): string {
  if (viewer === null || viewer === undefined) return 'guest';

  if (typeof viewer === 'string') {
    const id = viewer.trim();
    if (id === 'guest') return 'guest';
    const match = /^(user|admin):(.+)$/.exec(id);
    if (!match || !match[2].trim()) {
      throw new TypeError('viewer context must use guest, user:<id>, or admin:<id>');
    }
    return `${match[1]}:${match[2].trim()}`;
  }

  const nestedUser = viewer.user;
  const rawId = viewer._id ?? viewer.id ?? nestedUser?._id ?? nestedUser?.id;
  const id = typeof rawId === 'string' ? rawId.trim() : '';
  if (!id || id === 'guest') return 'guest';

  const isAdmin = viewer.isAdmin === true || viewer.role === 'admin'
    || nestedUser?.isAdmin === true || nestedUser?.role === 'admin';
  return `${isAdmin ? 'admin' : 'user'}:${id}`;
}

const SCOPES = new Set<ActivityScope>(['smart', 'region', 'country', 'global']);
const COUNTRY_CODE = /^[A-Z]{2}$/;
const REGION_CODE = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

function normalizeCode(
  value: unknown,
  field: 'countryCode' | 'regionCode',
  pattern: RegExp,
  maxLength: number,
) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`);
  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized.length > maxLength || !pattern.test(normalized)) {
    throw new TypeError(`${field} is invalid`);
  }
  return normalized;
}

export function normalizeActivityQuery(input: object = {}): ActivityQuery {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('activity query must be an object');
  }
  const values = input as Record<string, unknown>;

  const scope = values.scope === undefined ? DEFAULT_ACTIVITY_QUERY.scope : values.scope;
  if (typeof scope !== 'string' || !SCOPES.has(scope as ActivityScope)) {
    throw new TypeError('scope is invalid');
  }

  const limit = values.limit === undefined ? DEFAULT_ACTIVITY_QUERY.limit : values.limit;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new TypeError('limit must be an integer from 1 to 50');
  }

  const result: ActivityQuery = { scope: scope as ActivityScope, limit };
  if (scope === 'global') return result;

  if (scope === 'country') {
    if (values.countryCode === undefined) throw new TypeError('countryCode is required');
    result.countryCode = normalizeCode(values.countryCode, 'countryCode', COUNTRY_CODE, 2);
    return result;
  }

  if (scope === 'region') {
    if (values.countryCode === undefined) throw new TypeError('countryCode is required');
    if (values.regionCode === undefined) throw new TypeError('regionCode is required');
    result.countryCode = normalizeCode(values.countryCode, 'countryCode', COUNTRY_CODE, 2);
    result.regionCode = normalizeCode(values.regionCode, 'regionCode', REGION_CODE, 40);
    return result;
  }

  if (values.countryCode !== undefined) {
    result.countryCode = normalizeCode(values.countryCode, 'countryCode', COUNTRY_CODE, 2);
  }
  if (values.regionCode !== undefined) {
    if (!result.countryCode) throw new TypeError('countryCode is required with regionCode');
    result.regionCode = normalizeCode(values.regionCode, 'regionCode', REGION_CODE, 40);
  }
  return result;
}

export function activityRequestParams(input: object, cursor?: string) {
  const query = normalizeActivityQuery(input);
  const params: Record<string, string | number> = {};
  if (query.scope !== DEFAULT_ACTIVITY_QUERY.scope) params.scope = query.scope;
  if (query.countryCode) params.countryCode = query.countryCode;
  if (query.regionCode) params.regionCode = query.regionCode;
  if (query.limit !== DEFAULT_ACTIVITY_QUERY.limit) params.limit = query.limit;
  if (cursor) params.cursor = cursor;
  return params;
}

export function activityQueryKey(input: object, viewer: ActivityViewer = 'guest') {
  return ['footprints', 'activity', canonicalViewerIdentity(viewer), normalizeActivityQuery(input)] as const;
}
