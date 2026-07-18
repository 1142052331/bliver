import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAP_ATTRIBUTIONS,
  DEFAULT_MAP_STYLE_URL,
  parseMapAttributions,
  resolveMapProvider,
  resolveMapStyleUrl,
} from '../map-provider.js';

describe('map provider configuration', () => {
  const currentPageUrl = 'https://bliver.example/map';

  it('uses the keyless OpenFreeMap style by default', () => {
    expect(resolveMapStyleUrl('', currentPageUrl)).toBe(DEFAULT_MAP_STYLE_URL);
  });

  it('accepts a relative same-origin deployment style', () => {
    expect(resolveMapStyleUrl('  /maps/style.json  ', currentPageUrl))
      .toBe('/maps/style.json');
  });

  it('accepts an absolute style on the current page origin', () => {
    expect(resolveMapStyleUrl(
      'https://bliver.example/maps/style.json',
      currentPageUrl,
    )).toBe('https://bliver.example/maps/style.json');
  });

  it('binds a configured same-origin style to structured attribution', () => {
    expect(resolveMapProvider(
      '/maps/style.json',
      '[{"label":"Provider terms","href":"https://maps.example/terms"}]',
      currentPageUrl,
    )).toEqual({
      styleUrl: '/maps/style.json',
      attributions: [
        { label: 'Provider terms', href: 'https://maps.example/terms' },
      ],
    });
  });

  it('keeps the audited OpenFreeMap credit set with its fallback style', () => {
    expect(resolveMapProvider('', '', currentPageUrl).attributions)
      .toEqual(DEFAULT_MAP_ATTRIBUTIONS);
  });

  it('fails closed when a configured provider has missing or unsafe credit', () => {
    expect(() => resolveMapProvider('/maps/style.json', '', currentPageUrl))
      .toThrow(/VITE_MAP_ATTRIBUTION_JSON/);
    expect(() => parseMapAttributions(
      '[{"label":"Unsafe","href":"javascript:alert(1)"}]',
    )).toThrow(/root-relative or HTTPS/);
  });

  it('accepts only the HTTPS OpenFreeMap provider as an external origin', () => {
    expect(resolveMapStyleUrl(
      'https://tiles.openfreemap.org/styles/bright',
      currentPageUrl,
    )).toBe('https://tiles.openfreemap.org/styles/bright');
  });

  it.each([
    'https://maps.example.net/style.json',
    'https://tiles.openfreemap.org.evil.example/style.json',
    'http://tiles.openfreemap.org/styles/liberty',
    '//maps.example.net/style.json',
    'data:application/json,{}',
    'http://[invalid',
  ])('fails closed for a disallowed provider: %s', (configuredUrl) => {
    expect(() => resolveMapStyleUrl(configuredUrl, currentPageUrl))
      .toThrow(/VITE_MAP_STYLE_URL/);
  });
});
