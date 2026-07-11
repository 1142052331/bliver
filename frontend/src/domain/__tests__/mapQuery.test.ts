import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_QUERY,
  mapQueryKey,
  mergeCanonicalMapParams,
  parseMapQuery,
  serializeMapQuery,
} from '../mapQuery';

describe('map query URL state', () => {
  it('round-trips a valid fixed-region state', () => {
    const query = {
      ...DEFAULT_MAP_QUERY,
      scope: 'region' as const,
      countryCode: 'CN',
      regionCode: 'CN-SH',
      relationship: 'friends' as const,
      period: '24h' as const,
      content: 'photo' as const,
      query: '高知',
    };

    expect(parseMapQuery(serializeMapQuery(query))).toEqual(query);
  });

  it('falls back from invalid or incomplete values', () => {
    expect(parseMapQuery(new URLSearchParams(
      'scope=region&relationship=followers&period=forever&content=video&q=test',
    ))).toEqual({ ...DEFAULT_MAP_QUERY, query: 'test' });
  });

  it('disables guest unread state explicitly', () => {
    expect(parseMapQuery(new URLSearchParams('content=unread'), { isAuthenticated: false }))
      .toEqual(DEFAULT_MAP_QUERY);
  });

  it('omits defaults and transient smart location context from canonical URLs', () => {
    expect(serializeMapQuery({
      ...DEFAULT_MAP_QUERY,
      countryCode: 'CN',
      regionCode: 'CN-SH',
    }).toString()).toBe('');
  });

  it('preserves unrelated URL parameters while replacing map state', () => {
    const current = new URLSearchParams('fp=footprint-1&period=24h&q=old');
    const next = { ...DEFAULT_MAP_QUERY, scope: 'global' as const, query: 'new' };
    expect(mergeCanonicalMapParams(current, next).toString())
      .toBe('fp=footprint-1&scope=global&q=new');
  });

  it('uses one stable map query prefix', () => {
    expect(mapQueryKey(DEFAULT_MAP_QUERY)).toEqual(['footprints', 'map', DEFAULT_MAP_QUERY]);
  });
});
