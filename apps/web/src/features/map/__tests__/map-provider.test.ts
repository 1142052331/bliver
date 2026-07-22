import type { StyleSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';

import {
  createNaturalCityMapStyle,
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

  it('applies Natural City material and localized labels inside the MapLibre style', () => {
    const sourceStyle: StyleSpecification = {
      version: 8,
      sources: {},
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#ffffff' },
        },
        {
          id: 'water',
          type: 'fill',
          source: 'openmaptiles',
          'source-layer': 'water',
          paint: { 'fill-color': '#b5c1c8' },
        },
        {
          id: 'highway_minor',
          type: 'line',
          source: 'openmaptiles',
          'source-layer': 'transportation',
          paint: { 'line-color': '#f0d7a0' },
        },
        {
          id: 'label_city',
          type: 'symbol',
          source: 'openmaptiles',
          'source-layer': 'place',
          layout: { 'text-field': ['get', 'name'] },
          paint: { 'text-color': '#000000' },
        },
      ],
    };

    const transformed = createNaturalCityMapStyle(sourceStyle, 'zh-CN');
    const originalLayers = sourceStyle.layers;
    const nextLayers = transformed.layers;
    const background = nextLayers.find((layer) => layer.id === 'background');
    const water = nextLayers.find((layer) => layer.id === 'water');
    const road = nextLayers.find((layer) => layer.id === 'highway_minor');
    const city = nextLayers.find((layer) => layer.id === 'label_city');

    expect(background).toMatchObject({ paint: { 'background-color': '#faf8f3' } });
    expect(water).toMatchObject({ paint: { 'fill-color': '#c5d8d1' } });
    expect(road).toMatchObject({ paint: { 'line-color': '#d2ddd6' } });
    expect(city).toMatchObject({
      layout: {
        'text-field': [
          'coalesce',
          ['get', 'name:zh-Hans'],
          ['get', 'name:zh'],
          ['get', 'name:nonlatin'],
          ['get', 'name'],
          ['get', 'name:latin'],
          ['get', 'name_en'],
        ],
      },
      paint: {
        'text-color': '#29493e',
        'text-halo-color': '#faf8f3',
      },
    });
    expect(transformed.transition).toEqual({ duration: 160, delay: 0 });
    expect(sourceStyle.layers).toBe(originalLayers);
    expect(sourceStyle.layers[0]?.paint).toEqual({ 'background-color': '#ffffff' });
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
