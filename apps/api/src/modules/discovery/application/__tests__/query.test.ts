import { describe, expect, it } from 'vitest';
import { createFootprintId, createUserId } from '@bliver/domain';
import { FootprintVisibilityPolicy } from '../../../footprints/index.js';
import { createMemoryDiscoveryRepository, DiscoveryQueryService, type DiscoveryEntry } from '../index.js';

const owner = createUserId(); const now = new Date('2026-07-15T08:00:00.000Z');
function entry(overrides: Partial<DiscoveryEntry> = {}): DiscoveryEntry { return { id: createFootprintId(), authorId: owner, author: { name: 'Owner' }, displayPoint: { lat: 31, lng: 121 }, visibility: 'public', locationPrecision: 'approximate', publishedAt: new Date('2026-07-15T07:00:00.000Z'), discoveryExpiresAt: new Date('2026-07-15T09:00:00.000Z'), message: 'River walk', regionId: 'region-a', countryCode: 'CN', ...overrides }; }
function service(entries: DiscoveryEntry[]) { const repository = createMemoryDiscoveryRepository(entries); const policy = new FootprintVisibilityPolicy({ records: { async findById(id) { return entries.find((item) => item.id === id) ?? null; } }, friendships: { async areAcceptedFriends() { return false; } }, blocks: { async isEitherBlocked() { return false; } }, moderation: { async hasCaseAccess() { return false; } }, now: () => now }); return new DiscoveryQueryService({ repository, policy, cursorSecret: 'test' }); }
const base = { actor: null, scope: 'smart' as const, relationship: 'all' as const, content: 'all' as const, limit: 20 };
describe('DiscoveryQueryService', () => {
  it('falls back from empty region candidates to country/global and preserves newest-first ordering', async () => { const item = entry({ regionId: 'region-b' }); const result = await service([item]).execute({ ...base, regionId: 'region-a', countryCode: 'CN' }); expect(result.resolvedScope).toBe('country'); expect(result.items[0]?.id).toBe(item.id); });
  it('supports media and text filters without loading all entries into the query contract', async () => { const media = entry({ hasMedia: true, message: 'Concert photo' }); const text = entry({ message: 'Coffee' }); const result = await service([media, text]).execute({ ...base, content: 'media', query: 'photo' }); expect(result.items.map((item) => item.id)).toEqual([media.id]); });
  it('does not expose expired public records to guests', async () => { const expired = entry({ discoveryExpiresAt: new Date('2026-07-15T07:59:00.000Z') }); await expect(service([expired]).execute(base)).resolves.toMatchObject({ items: [] }); });
  it('returns an explicit empty page for anonymous friends scope', async () => { const item = entry(); await expect(service([item]).execute({ ...base, relationship: 'friends' })).resolves.toMatchObject({ items: [], resolvedScope: 'global' }); });
  it('does not skip country rows when a later smart page falls back after region exhaustion', async () => {
    const region = entry({ publishedAt: new Date('2026-07-15T07:00:00.000Z'), regionId: 'region-a' });
    const country = entry({ publishedAt: new Date('2026-07-15T06:00:00.000Z'), regionId: 'region-b' });
    const global = entry({ publishedAt: new Date('2026-07-15T05:00:00.000Z'), regionId: 'region-c', countryCode: 'US' });
    const query = service([region, country, global]);
    const first = await query.execute({ ...base, regionId: 'region-a', countryCode: 'CN', limit: 1 });
    const second = await query.execute({ ...base, regionId: 'region-a', countryCode: 'CN', limit: 1, cursor: first.nextCursor });
    const third = await query.execute({ ...base, regionId: 'region-a', countryCode: 'CN', limit: 1, cursor: second.nextCursor });
    expect(first.items.map((item) => item.id)).toEqual([region.id]);
    expect(second.items.map((item) => item.id)).toEqual([country.id]);
    expect(third.items.map((item) => item.id)).toEqual([global.id]);
  });
  it('returns an explicit empty page for guest unread content', async () => {
    await expect(service([entry()]).execute({ ...base, content: 'unread' })).resolves.toMatchObject({ items: [], resolvedScope: 'global' });
  });
});
