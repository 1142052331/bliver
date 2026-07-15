import type { ActorContext } from '../../identity/index.js';
import { decodeSignedCursor, encodeSignedCursor } from '../../../platform/pagination/cursor.js';
import type { FootprintDto, FootprintPolicyInput, FootprintVisibilityPolicy } from '../domain/visibility-policy.js';

export interface MapBounds { readonly west: number; readonly south: number; readonly east: number; readonly north: number; }
export interface MapAccessFilterContext { readonly viewerId: string | null; readonly addParameter: (value: unknown) => string; }
export type MapAccessFilter = (context: MapAccessFilterContext) => string;
export interface MapFootprintRepository { listInViewport(input: { readonly bounds: MapBounds; readonly visibility?: string; readonly viewerId?: string | null; readonly limit?: number; readonly cursor?: { readonly publishedAt: string; readonly id: string } }): Promise<FootprintPolicyInput[]>; }
export interface MapFootprintQueryOptions { readonly repository: MapFootprintRepository; readonly policy: FootprintVisibilityPolicy; readonly maxResults?: number; }
export interface MapFootprintResult { readonly items: FootprintDto[]; readonly nextCursor: string | null; }

function validateBounds(bounds: MapBounds): void {
  if (![bounds.west, bounds.south, bounds.east, bounds.north].every(Number.isFinite) || bounds.south < -90 || bounds.north > 90 || bounds.south >= bounds.north || bounds.west >= bounds.east) throw new TypeError('Invalid map bounds');
}

export class MapFootprintQuery {
  private readonly maxResults: number;
  constructor(private readonly options: MapFootprintQueryOptions) { this.maxResults = Math.max(1, Math.min(100, Math.floor(options.maxResults ?? 50))); }
  async execute(input: { readonly actor: ActorContext | null; readonly bounds: MapBounds; readonly cursor?: string; readonly visibility?: string; readonly limit?: number }): Promise<MapFootprintResult> {
    validateBounds(input.bounds);
    const effectiveLimit = Math.min(this.maxResults, Math.max(1, Math.floor(input.limit ?? this.maxResults)));
    const cursor = input.cursor ? decodeSignedCursor(input.cursor) : null;
    if (input.cursor && !cursor) throw new TypeError('Invalid cursor');
    const records = await this.options.repository.listInViewport({ bounds: input.bounds, viewerId: input.actor?.userId ?? null, limit: effectiveLimit + 1, ...(cursor ? { cursor } : {}), ...(input.visibility ? { visibility: input.visibility } : {}) });
    const readable = await this.options.policy.readFilter(input.actor, records);
    const ordered = [...readable].sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime() || right.id.localeCompare(left.id));
    const filtered = cursor ? ordered.filter((record) => record.publishedAt.toISOString() < cursor.publishedAt || (record.publishedAt.toISOString() === cursor.publishedAt && record.id < cursor.id)) : ordered;
    const page = filtered.slice(0, effectiveLimit);
    const items: FootprintDto[] = [];
    for (const item of page) items.push(await this.options.policy.toPublicDto(input.actor, item));
    const last = page[page.length - 1];
    return { items, nextCursor: filtered.length > effectiveLimit && last ? encodeSignedCursor({ id: last.id, publishedAt: last.publishedAt.toISOString() }) : null };
  }
}

export function createMemoryMapFootprintRepository(records: readonly FootprintPolicyInput[]): MapFootprintRepository {
  return { async listInViewport({ bounds, visibility }) { return records.filter((record) => record.displayPoint.lat >= bounds.south && record.displayPoint.lat <= bounds.north && record.displayPoint.lng >= bounds.west && record.displayPoint.lng <= bounds.east && (!visibility || record.visibility === visibility)); } };
}
