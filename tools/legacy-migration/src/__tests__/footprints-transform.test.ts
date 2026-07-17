import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { version } from 'uuid';

import { FixtureSource } from '../adapters/fixture-source.js';
import { transformFootprints } from '../domain/footprints.js';

describe('legacy footprint transformation', () => {
  it('maps private/display geography and a matching discovery projection without events', async () => {
    const source = await (await FixtureSource.fromFile(resolve('fixtures/v1-complete.json'))).collections();
    const result = transformFootprints(source.Footprint, new Map());
    const first = result.footprints.find((row) => row.message === 'public footprint')!;
    expect(version(first.id)).toBe(7);
    expect(first.privatePoint).toEqual({ lat: 31.2305, lng: 121.4738 });
    expect(first.displayPoint).toEqual({ lat: 31.2304, lng: 121.4737 });
    expect(result.discovery.find((row) => row.footprintId === first.id)).toMatchObject({
      authorId: first.authorId,
      visibility: first.visibility,
      displayPoint: first.displayPoint,
      hasMedia: false,
    });
    expect(result.footprints.find((row) => row.message === 'legacy visibility')?.visibility).toBe('public');
    expect(result.regions.map((row) => row.countryCode).sort()).toEqual(['CN', 'CN', 'HK']);
    expect(result.outbox).toEqual([]);
  });

  it('creates media rows only from preverified metadata', async () => {
    const source = await (await FixtureSource.fromFile(resolve('fixtures/v1-complete.json'))).collections();
    source.Footprint[0]!.photoUrl = 'https://res.cloudinary.com/bliver/image/upload/v7/legacy/photo.jpg';
    const result = transformFootprints(source.Footprint, new Map([[String(source.Footprint[0]!._id), {
      publicId: 'legacy/photo', mimeType: 'image/jpeg', bytes: 1024, version: 7, width: 800, height: 600, format: 'jpg',
    }]]));
    expect(result.mediaAssets).toHaveLength(1);
    expect(result.footprintMedia).toHaveLength(1);
    expect(result.discovery.find((row) => row.message === 'public footprint')?.hasMedia).toBe(true);
  });
});
