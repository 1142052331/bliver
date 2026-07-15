import type { FootprintId, UserId } from '@bliver/domain';

const EARTH_RADIUS_METERS = 6_371_000;
const MINIMUM_OFFSET_METERS = 150;
const OFFSET_RANGE_METERS = 350;

export interface GeoPoint {
  readonly lat: number;
  readonly lng: number;
}

export type LocationPrecision = 'precise' | 'approximate';

export interface CreateDisplayPointInput {
  readonly footprintId: FootprintId;
  readonly authorId: UserId;
  readonly privatePoint: GeoPoint;
  readonly locationPrecision: LocationPrecision;
}

function validatePoint(point: GeoPoint): void {
  if (
    !Number.isFinite(point.lat) ||
    !Number.isFinite(point.lng) ||
    point.lat < -90 ||
    point.lat > 90 ||
    point.lng < -180 ||
    point.lng > 180
  ) {
    throw new TypeError('Private point must be valid WGS84 coordinates');
  }
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function normalizeLongitude(value: number): number {
  return ((value + 540) % 360) - 180;
}

function offsetPoint(point: GeoPoint, seed: string): GeoPoint {
  const angle = (stableHash(`${seed}:angle`) / 2 ** 32) * Math.PI * 2;
  const distance =
    MINIMUM_OFFSET_METERS +
    (stableHash(`${seed}:distance`) / 2 ** 32) * OFFSET_RANGE_METERS;
  const angularDistance = distance / EARTH_RADIUS_METERS;
  const latitude = toRadians(point.lat);
  const longitude = toRadians(point.lng);
  const destinationLatitude = Math.asin(
    Math.max(
      -1,
      Math.min(
        1,
        Math.sin(latitude) * Math.cos(angularDistance) +
          Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(angle),
      ),
    ),
  );
  const destinationLongitude =
    longitude +
    Math.atan2(
      Math.sin(angle) * Math.sin(angularDistance) * Math.cos(latitude),
      Math.cos(angularDistance) -
        Math.sin(latitude) * Math.sin(destinationLatitude),
    );

  return {
    lat: toDegrees(destinationLatitude),
    lng: normalizeLongitude(toDegrees(destinationLongitude)),
  };
}

export function createDisplayPoint(input: CreateDisplayPointInput): GeoPoint {
  validatePoint(input.privatePoint);

  if (input.locationPrecision === 'precise') {
    return { ...input.privatePoint };
  }

  const { lat, lng } = input.privatePoint;
  const seed = `${input.footprintId}:${input.authorId}:${lat}:${lng}`;
  return offsetPoint(input.privatePoint, seed);
}
