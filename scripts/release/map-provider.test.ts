import { describe, expect, it } from 'vitest';

import {
  parseMapProviderAttributions,
  verifyMapProviderRelease,
} from './map-provider.js';

const attributions = JSON.stringify([
  { label: 'Provider terms', href: 'https://maps.example/terms' },
  { label: 'OpenStreetMap contributors', href: '/map/copyright' },
]);

describe('production map provider release gate', () => {
  it('accepts an attributed root-relative provider', () => {
    expect(verifyMapProviderRelease({
      styleUrl: '/maps/style.json',
      attributionJson: attributions,
    })).toEqual({
      mode: 'same-origin',
      styleUrl: '/maps/style.json',
      attributions: [
        { label: 'Provider terms', href: 'https://maps.example/terms' },
        { label: 'OpenStreetMap contributors', href: '/map/copyright' },
      ],
    });
  });

  it.each([
    'https://maps.example/style.json',
    '//maps.example/style.json',
    'maps/style.json',
  ])('rejects a routine production URL that is not root-relative: %s', (styleUrl) => {
    expect(() => verifyMapProviderRelease({ styleUrl, attributionJson: attributions }))
      .toThrow(/root-relative/);
  });

  it('requires complete structured attribution for a routine provider', () => {
    expect(() => verifyMapProviderRelease({ styleUrl: '/maps/style.json' }))
      .toThrow(/VITE_MAP_ATTRIBUTION_JSON is required/);
    expect(() => parseMapProviderAttributions('[{"label":"Missing URL"}]'))
      .toThrow(/require label and href/);
    expect(() => parseMapProviderAttributions(
      '[{"label":"Unsafe","href":"javascript:alert(1)"}]',
    )).toThrow(/root-relative or HTTPS/);
  });

  it('allows only an explicit, unexpired OpenFreeMap emergency window', () => {
    const now = new Date('2026-07-18T00:00:00.000Z');
    expect(verifyMapProviderRelease({
      emergencyApproved: '1',
      emergencyExpiresAt: '2026-07-20T00:00:00.000Z',
    }, now).mode).toBe('openfreemap-emergency');
    expect(() => verifyMapProviderRelease({}, now)).toThrow(/EMERGENCY=1/);
    expect(() => verifyMapProviderRelease({
      emergencyApproved: '1',
      emergencyExpiresAt: '2026-07-17T00:00:00.000Z',
    }, now)).toThrow(/future/);
    expect(() => verifyMapProviderRelease({
      emergencyApproved: '1',
      emergencyExpiresAt: '2026-08-18T00:00:00.000Z',
    }, now)).toThrow(/7 days/);
  });
});
