export type Visibility = 'public' | 'friends' | 'private';

export interface DiscoverableFootprint {
  readonly visibility: Visibility;
  readonly discoveryExpiresAt: Date;
}

export function canDiscover(
  footprint: DiscoverableFootprint,
  now: Date,
): boolean {
  return (
    footprint.visibility === 'public' &&
    footprint.discoveryExpiresAt.getTime() > now.getTime()
  );
}
