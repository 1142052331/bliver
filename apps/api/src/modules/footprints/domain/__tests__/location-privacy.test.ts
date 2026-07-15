import { createFootprintId, createUserId } from '@bliver/domain';
import { describe, expect, it } from 'vitest';

import { createDisplayPoint } from '../../index.js';

describe('createDisplayPoint', () => {
  it('preserves the exact point for precise publishing', () => {
    const privatePoint = { lat: 31.2304, lng: 121.4737 };

    expect(
      createDisplayPoint({
        footprintId: createFootprintId(),
        authorId: createUserId(),
        privatePoint,
        locationPrecision: 'precise',
      }),
    ).toEqual(privatePoint);
  });

  it('produces the same approximate point from the same stable inputs', () => {
    const input = {
      footprintId: createFootprintId(),
      authorId: createUserId(),
      privatePoint: { lat: 31.2304, lng: 121.4737 },
      locationPrecision: 'approximate' as const,
    };

    const first = createDisplayPoint(input);
    const second = createDisplayPoint(input);

    expect(first).toEqual(second);
    expect(first).not.toEqual(input.privatePoint);
  });

  it.each([
    { lat: 0, lng: 0 },
    { lat: 90, lng: 180 },
    { lat: -90, lng: -180 },
    { lat: 89.999999, lng: -179.999999 },
    { lat: -89.999999, lng: 179.999999 },
  ])('keeps approximate output valid near coordinate boundaries: %j', (point) => {
    for (let index = 0; index < 25; index += 1) {
      const result = createDisplayPoint({
        footprintId: createFootprintId(),
        authorId: createUserId(),
        privatePoint: point,
        locationPrecision: 'approximate',
      });

      expect(Number.isFinite(result.lat)).toBe(true);
      expect(Number.isFinite(result.lng)).toBe(true);
      expect(result.lat).toBeGreaterThanOrEqual(-90);
      expect(result.lat).toBeLessThanOrEqual(90);
      expect(result.lng).toBeGreaterThanOrEqual(-180);
      expect(result.lng).toBeLessThanOrEqual(180);
    }
  });

  it.each([
    { lat: 90.000001, lng: 0 },
    { lat: -90.000001, lng: 0 },
    { lat: 0, lng: 180.000001 },
    { lat: 0, lng: -180.000001 },
    { lat: Number.NaN, lng: 0 },
  ])('rejects invalid private coordinates: %j', (privatePoint) => {
    expect(() =>
      createDisplayPoint({
        footprintId: createFootprintId(),
        authorId: createUserId(),
        privatePoint,
        locationPrecision: 'approximate',
      }),
    ).toThrow(TypeError);
  });
});
