import { activityQuery, type ActivityQuery } from '@bliver/contracts';
import { decodeDiscoveryCursor, encodeDiscoveryCursor } from './cursor.js';
import type { ActivityPageDto, DiscoveryEntry, DiscoveryQueryInput, DiscoveryQueryOptions, DiscoveryScope, DiscoveryRepository } from './ports.js';

const scopeOrder: readonly DiscoveryScope[] = ['region', 'country', 'global'];

function scopes(requested: ActivityQuery['scope'], hasRegion: boolean, hasCountry: boolean): DiscoveryScope[] {
  if (requested === 'region') return hasRegion ? ['region'] : [];
  if (requested === 'country') return hasCountry ? ['country'] : [];
  if (requested === 'global') return ['global'];
  return hasRegion ? [...scopeOrder] : hasCountry ? ['country', 'global'] : ['global'];
}

function order(records: readonly DiscoveryEntry[]): DiscoveryEntry[] {
  return [...records].sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime() || right.id.localeCompare(left.id));
}

export class DiscoveryQueryService {
  private readonly maxLimit: number;
  constructor(private readonly options: DiscoveryQueryOptions) { this.maxLimit = Math.max(1, Math.min(100, Math.floor(options.maxLimit ?? 50))); }

  async execute(input: DiscoveryQueryInput): Promise<ActivityPageDto> {
    const parsed = activityQuery.parse({ scope: input.scope, relationship: input.relationship, content: input.content, ...(input.query ? { query: input.query } : {}), ...(input.cursor ? { cursor: input.cursor } : {}), limit: input.limit });
    const limit = Math.min(this.maxLimit, parsed.limit);
    const cursor = decodeDiscoveryCursor(parsed.cursor, this.options.cursorSecret);
    if (parsed.cursor && !cursor) throw new TypeError('Invalid cursor');
    const requestedScopes = scopes(parsed.scope, Boolean(input.regionId), Boolean(input.countryCode));
    let resolvedScope = requestedScopes[0] ?? (input.countryCode ? 'country' : 'global');
    if (!input.actor && parsed.relationship === 'friends') return { items: [], resolvedScope };
    let visible: DiscoveryEntry[] = [];
    for (const [index, scope] of requestedScopes.entries()) {
      const batch = await this.options.repository.listCandidates({ scope, actorId: input.actor?.userId ?? null, ...(input.regionId ? { regionId: input.regionId } : {}), ...(input.countryCode ? { countryCode: input.countryCode } : {}), ...(parsed.query ? { query: parsed.query } : {}), relationship: parsed.relationship, content: parsed.content, ...(cursor ? { cursor } : {}), limit: limit + 1 });
      const filtered = order([...new Map((await this.options.policy.readFilter(input.actor, batch)).map((item) => [item.id, item])).values()]);
      if (parsed.scope !== 'smart' || filtered.length > 0 || index === requestedScopes.length - 1) { visible = filtered; resolvedScope = scope; break; }
    }
    const afterCursor = cursor ? visible.filter((item) => item.publishedAt.toISOString() < cursor.publishedAt || (item.publishedAt.toISOString() === cursor.publishedAt && item.id < cursor.id)) : visible;
    const page = afterCursor.slice(0, limit);
    const items = await Promise.all(page.map((item) => this.options.policy.toPublicDto(input.actor, item)));
    const hasMore = afterCursor.length > limit;
    return { items, resolvedScope, ...(hasMore && page.length ? { nextCursor: encodeDiscoveryCursor({ publishedAt: page[page.length - 1]!.publishedAt.toISOString(), id: page[page.length - 1]!.id }, this.options.cursorSecret) } : {}) };
  }
}

export function createMemoryDiscoveryRepository(records: readonly DiscoveryEntry[] = []): DiscoveryRepository {
  const entries = new Map(records.map((entry) => [entry.id, entry]));
  return {
    async listCandidates(input) {
      const now = Date.now();
      return [...entries.values()].filter((entry) => {
        if (entry.deletedAt) return false;
        if (input.scope === 'region' && input.regionId && entry.regionId !== input.regionId) return false;
        if ((input.scope === 'country' || input.scope === 'global') && input.scope !== 'global' && input.countryCode && entry.countryCode !== input.countryCode) return false;
        if (!input.actorId && (!entry.discoveryExpiresAt || entry.discoveryExpiresAt.getTime() <= now)) return false;
        if (input.relationship === 'public' && entry.visibility !== 'public') return false;
        if (input.relationship === 'friends' && entry.visibility === 'public') return false;
        if (input.content === 'media' && !entry.hasMedia) return false;
        if (input.query && !(entry.message ?? '').toLocaleLowerCase().includes(input.query.toLocaleLowerCase())) return false;
        if (input.cursor && !(entry.publishedAt.toISOString() < input.cursor.publishedAt || (entry.publishedAt.toISOString() === input.cursor.publishedAt && entry.id < input.cursor.id))) return false;
        return true;
      }).sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime() || right.id.localeCompare(left.id)).slice(0, input.limit);
    },
    async upsert(entry) { entries.set(entry.id, entry); },
    async remove(id) { entries.delete(id as never); },
  };
}
