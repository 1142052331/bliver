import { V2_TEST_NOW, V2_TEST_USERS, type V2TestActor } from './users.js';

export interface V2TestFootprint {
  readonly id: string;
  readonly author: { readonly id: string; readonly name: string };
  readonly displayPoint: { readonly lat: number; readonly lng: number };
  readonly visibility: 'public' | 'friends' | 'private';
  readonly locationPrecision: 'precise' | 'approximate';
  readonly message: string;
  readonly publishedAt: string;
  readonly discoveryExpiresAt: string;
}

export const V2_TEST_FOOTPRINTS: readonly V2TestFootprint[] = [
  {
    id: '019f0000-0000-7000-8000-000000000711',
    author: { id: V2_TEST_USERS.userA.id, name: V2_TEST_USERS.userA.displayName },
    displayPoint: { lat: 31.231, lng: 121.471 },
    visibility: 'public',
    locationPrecision: 'approximate',
    message: 'Public river morning',
    publishedAt: V2_TEST_NOW,
    discoveryExpiresAt: '2099-07-16T08:00:00.000Z',
  },
  {
    id: '019f0000-0000-7000-8000-000000000712',
    author: { id: V2_TEST_USERS.userB.id, name: V2_TEST_USERS.userB.displayName },
    displayPoint: { lat: 31.228, lng: 121.478 },
    visibility: 'friends',
    locationPrecision: 'precise',
    message: 'Friends at the harbor',
    publishedAt: '2026-07-15T07:00:00.000Z',
    discoveryExpiresAt: '2099-07-16T07:00:00.000Z',
  },
  {
    id: '019f0000-0000-7000-8000-000000000713',
    author: { id: V2_TEST_USERS.userA.id, name: V2_TEST_USERS.userA.displayName },
    displayPoint: { lat: 31.225, lng: 121.465 },
    visibility: 'private',
    locationPrecision: 'precise',
    message: 'Private garden note',
    publishedAt: '2026-07-15T06:00:00.000Z',
    discoveryExpiresAt: '2099-07-16T06:00:00.000Z',
  },
];

export function visibleFootprintsFor(actor: V2TestActor): readonly V2TestFootprint[] {
  if (actor === 'guest') return V2_TEST_FOOTPRINTS.filter((item) => item.visibility === 'public');
  const viewer = V2_TEST_USERS[actor];
  return V2_TEST_FOOTPRINTS.filter(
    (item) => item.visibility === 'public' || item.visibility === 'friends' || item.author.id === viewer.id,
  );
}
