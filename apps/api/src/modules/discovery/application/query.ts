import { activityQuery, type ActivityQuery } from '@bliver/contracts';
import { decodeDiscoveryCursor, encodeDiscoveryCursor } from './cursor.js';
import type { ActivityPageDto, DiscoveryEntry, DiscoveryQueryInput, DiscoveryQueryOptions, DiscoveryScope, DiscoveryRepository } from './ports.js';

const scopeOrder: readonly DiscoveryScope[] = ['region', 'country', 'global'];

function scopes(requested: ActivityQuery['scope'], hasRegion: boolean, hasCountry: boolean): DiscoveryScope[] {
  if (requested === 'region') return hasRegion ? ['region'] : [];
  if (requested === 'country') return hasCountry ? ['country'] : [];
  if (requested === 'global') return ['global'];
  return hasRegion ? (hasCountry ? [...scopeOrder] : ['region', 'global']) : hasCountry ? ['country', 'global'] : ['global'];
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
    const cursorScope = cursor?.scope;
    if (cursorScope && !requestedScopes.includes(cursorScope as DiscoveryScope)) throw new TypeError('Invalid cursor');
    const startIndex = cursorScope ? requestedScopes.indexOf(cursorScope as DiscoveryScope) : 0;
    const activeScopes = requestedScopes.slice(Math.max(0, startIndex));
    let resolvedScope = (cursorScope as DiscoveryScope | undefined) ?? requestedScopes[0] ?? (input.countryCode ? 'country' : 'global');
    if (!input.actor && (parsed.relationship === 'friends' || parsed.content === 'unread')) return { items: [], resolvedScope };
    const visible: Array<{ readonly entry: DiscoveryEntry; readonly scope: DiscoveryScope }> = [];
    for (const [index, scope] of activeScopes.entries()) {
      const scopeCursor = index === 0 && cursor && (!cursor.scope || cursor.scope === scope) ? cursor : null;
      const batch = await this.options.repository.listCandidates({ scope, actorId: input.actor?.userId ?? null, ...(input.regionId ? { regionId: input.regionId } : {}), ...(input.countryCode ? { countryCode: input.countryCode } : {}), ...(parsed.scope === 'smart' && scope === 'country' && input.regionId ? { excludeRegionId: input.regionId } : {}), ...(parsed.scope === 'smart' && scope === 'global' && input.countryCode ? { excludeCountryCode: input.countryCode } : {}), ...(parsed.query ? { query: parsed.query } : {}), relationship: parsed.relationship, content: parsed.content, ...(scopeCursor ? { cursor: scopeCursor } : {}), limit: limit + 1 - visible.length });
      const filtered = order([...new Map((await this.options.policy.readFilter(input.actor, batch)).map((item) => [item.id, item])).values()]);
      if (filtered.length && visible.length === 0) resolvedScope = scope;
      visible.push(...filtered.map((entry) => ({ entry, scope })));
      if (parsed.scope !== 'smart' || visible.length > limit) break;
    }
    const page = visible.slice(0, limit);
    const items = await Promise.all(page.map((item) => this.options.policy.toPublicDto(input.actor, item.entry)));
    const last = page[page.length - 1];
    return { items, resolvedScope, ...(visible.length > limit && last ? { nextCursor: encodeDiscoveryCursor({ publishedAt: last.entry.publishedAt.toISOString(), id: last.entry.id, scope: last.scope }, this.options.cursorSecret) } : {}) };
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
        if (input.excludeRegionId && entry.regionId === input.excludeRegionId) return false;
        if (input.excludeCountryCode && entry.countryCode === input.excludeCountryCode) return false;
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
