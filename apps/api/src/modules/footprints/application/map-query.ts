import type { ActorContext } from '../../identity/index.js';
import { decodeSignedCursor, encodeSignedCursor } from '../../../platform/pagination/cursor.js';
import type { FootprintDto, FootprintPolicyInput, FootprintVisibilityPolicy } from '../domain/visibility-policy.js';

export interface MapBounds { readonly west: number; readonly south: number; readonly east: number; readonly north: number; }
export interface MapAccessFilterContext { readonly viewerId: string | null; readonly addParameter: (value: unknown) => string; }
export type MapAccessFilter = (context: MapAccessFilterContext) => string;
export interface MapFootprintRepository { listInViewport(input: { readonly bounds: MapBounds; readonly visibility?: string; readonly viewerId?: string | null; readonly limit?: number; readonly cursor?: { readonly publishedAt: string; readonly id: string } }): Promise<FootprintPolicyInput[]>; }
export interface MapFootprintReadRepository {
  readIds(viewerId: string, footprintIds: readonly string[]): Promise<ReadonlySet<string>>;
  markRead(viewerId: string, footprintId: string): Promise<void>;
}
export interface MapFootprintQueryOptions { readonly repository: MapFootprintRepository; readonly policy: FootprintVisibilityPolicy; readonly reads?: MapFootprintReadRepository; readonly now?: () => Date; readonly maxResults?: number; readonly cursorSecret?: string; }
export type MapFootprintDto = FootprintDto & { readonly isNew: boolean };
export interface MapFootprintResult { readonly items: MapFootprintDto[]; readonly nextCursor: string | null; readonly viewerAuthenticated: boolean; }

function validateBounds(bounds: MapBounds): void {
  if (![bounds.west, bounds.south, bounds.east, bounds.north].every(Number.isFinite) || bounds.south < -90 || bounds.north > 90 || bounds.south >= bounds.north || bounds.west >= bounds.east) throw new TypeError('Invalid map bounds');
}

export class MapFootprintQuery {
  private readonly maxResults: number;
  constructor(private readonly options: MapFootprintQueryOptions) { this.maxResults = Math.max(1, Math.min(100, Math.floor(options.maxResults ?? 50))); }
  async execute(input: { readonly actor: ActorContext | null; readonly bounds: MapBounds; readonly cursor?: string; readonly visibility?: string; readonly limit?: number }): Promise<MapFootprintResult> {
    validateBounds(input.bounds);
    const effectiveLimit = Math.min(this.maxResults, Math.max(1, Math.floor(input.limit ?? this.maxResults)));
    const cursor = input.cursor ? decodeSignedCursor(input.cursor, this.options.cursorSecret) : null;
    if (input.cursor && !cursor) throw new TypeError('Invalid cursor');
    const records = await this.options.repository.listInViewport({ bounds: input.bounds, viewerId: input.actor?.userId ?? null, limit: effectiveLimit + 1, ...(cursor ? { cursor } : {}), ...(input.visibility ? { visibility: input.visibility } : {}) });
    const ordered = [...records].sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime() || right.id.localeCompare(left.id));
    const filtered = cursor ? ordered.filter((record) => record.publishedAt.toISOString() < cursor.publishedAt || (record.publishedAt.toISOString() === cursor.publishedAt && record.id < cursor.id)) : ordered;
    const scanned = filtered.slice(0, effectiveLimit);
    const page = await this.options.policy.readDtos(input.actor, scanned);
    const readIds = input.actor && this.options.reads
      ? await this.options.reads.readIds(input.actor.userId, page.map((item) => item.id))
      : new Set<string>();
    const now = (this.options.now ?? (() => new Date()))().getTime();
    const items: MapFootprintDto[] = [];
    for (const dto of page) {
      items.push({
        ...dto,
        isNew: dto.author.id !== input.actor?.userId
          && Boolean(dto.discoveryExpiresAt && new Date(dto.discoveryExpiresAt).getTime() > now)
          && !readIds.has(dto.id),
      });
    }
    const lastScanned = scanned[scanned.length - 1];
    return { items, nextCursor: filtered.length > effectiveLimit && lastScanned ? encodeSignedCursor({ id: lastScanned.id, publishedAt: lastScanned.publishedAt.toISOString() }, this.options.cursorSecret) : null, viewerAuthenticated: Boolean(input.actor) };
  }
}

export function createMemoryMapFootprintRepository(records: readonly FootprintPolicyInput[]): MapFootprintRepository {
  return { async listInViewport({ bounds, visibility }) { return records.filter((record) => record.displayPoint.lat >= bounds.south && record.displayPoint.lat <= bounds.north && record.displayPoint.lng >= bounds.west && record.displayPoint.lng <= bounds.east && (!visibility || record.visibility === visibility)); } };
}

export function createMemoryMapFootprintReadRepository(): MapFootprintReadRepository {
  const reads = new Set<string>();
  const key = (viewerId: string, footprintId: string): string => `${viewerId}:${footprintId}`;
  return {
    async readIds(viewerId, footprintIds) {
      return new Set(footprintIds.filter((footprintId) => reads.has(key(viewerId, footprintId))));
    },
    async markRead(viewerId, footprintId) { reads.add(key(viewerId, footprintId)); },
  };
}
