import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACTIVITY_QUERY,
  activityQueryKey,
  activityRequestParams,
  normalizeActivityQuery,
} from '../activityQuery';

describe('activity query state', () => {
  it('normalizes smart as the default and keeps only canonical fields', () => {
    expect(normalizeActivityQuery()).toEqual(DEFAULT_ACTIVITY_QUERY);
    expect(normalizeActivityQuery({
      scope: 'smart',
      countryCode: ' cn ',
      regionCode: ' cn-sh ',
      countryName: '中国',
      reason: 'resolved-location',
    })).toEqual({
      scope: 'smart',
      countryCode: 'CN',
      regionCode: 'CN-SH',
      limit: 20,
    });
  });

  it('requires canonical codes for fixed region and country scopes', () => {
    expect(normalizeActivityQuery({
      scope: 'region', countryCode: 'cn', regionCode: 'cn-sh',
    })).toEqual({
      scope: 'region', countryCode: 'CN', regionCode: 'CN-SH', limit: 20,
    });
    expect(normalizeActivityQuery({ scope: 'country', countryCode: 'jp' })).toEqual({
      scope: 'country', countryCode: 'JP', limit: 20,
    });

    expect(() => normalizeActivityQuery({ scope: 'region', regionCode: 'CN-SH' }))
      .toThrow(/countryCode/);
    expect(() => normalizeActivityQuery({ scope: 'country' })).toThrow(/countryCode/);
  });

  it('removes stale geography from global and country states', () => {
    expect(normalizeActivityQuery({
      scope: 'global', countryCode: 'CN', regionCode: 'CN-SH',
    })).toEqual({ scope: 'global', limit: 20 });
    expect(normalizeActivityQuery({
      scope: 'country', countryCode: 'CN', regionCode: 'CN-SH',
    })).toEqual({ scope: 'country', countryCode: 'CN', limit: 20 });
  });

  it.each([
    [{ scope: 'nearby' }, 'scope'],
    [{ scope: 'smart', countryCode: 'CHN' }, 'countryCode'],
    [{ scope: 'smart', regionCode: 'CN-SH' }, 'countryCode'],
    [{ scope: 'region', countryCode: 'CN', regionCode: 'Shanghai!' }, 'regionCode'],
    [{ scope: 'global', limit: 0 }, 'limit'],
    [{ scope: 'global', limit: 51 }, 'limit'],
    [{ scope: 'global', limit: 1.5 }, 'limit'],
  ])('rejects invalid input %#', (input, field) => {
    expect(() => normalizeActivityQuery(input)).toThrow(field);
  });

  it('serializes only server-relevant non-default parameters and cursor', () => {
    expect(activityRequestParams(DEFAULT_ACTIVITY_QUERY)).toEqual({});
    expect(activityRequestParams({
      scope: 'region', countryCode: 'CN', regionCode: 'CN-SH', limit: 12,
    }, 'opaque+/=')).toEqual({
      scope: 'region', countryCode: 'CN', regionCode: 'CN-SH', limit: 12,
      cursor: 'opaque+/=',
    });
  });

  it('uses the shared invalidation prefix while isolating viewers and scopes', () => {
    const smart = normalizeActivityQuery();
    const global = normalizeActivityQuery({ scope: 'global' });

    expect(activityQueryKey(smart, 'guest')).toEqual([
      'footprints', 'activity', 'guest', smart,
    ]);
    expect(activityQueryKey(smart, 'viewer-1')).not.toEqual(activityQueryKey(smart, 'guest'));
    expect(activityQueryKey(global, 'guest')).not.toEqual(activityQueryKey(smart, 'guest'));
    expect(activityQueryKey(smart, 'guest').slice(0, 2)).toEqual(['footprints', 'activity']);
  });

  it('canonicalizes raw scope state before placing it in a cache key', () => {
    expect(activityQueryKey({ scope: 'country', countryCode: ' cn ' }, 'guest')).toEqual([
      'footprints', 'activity', 'guest',
      { scope: 'country', countryCode: 'CN', limit: 20 },
    ]);
  });
});
