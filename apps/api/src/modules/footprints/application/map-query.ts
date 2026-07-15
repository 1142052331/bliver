import type { ActorContext } from '../../identity/index.js';
import type { FootprintDto, FootprintPolicyInput, FootprintVisibilityPolicy } from '../domain/visibility-policy.js';

export interface MapBounds { readonly west: number; readonly south: number; readonly east: number; readonly north: number; }
export interface MapFootprintRepository { listInViewport(input: { readonly bounds: MapBounds; readonly visibility?: string }): Promise<FootprintPolicyInput[]>; }
export interface MapFootprintQueryOptions { readonly repository: MapFootprintRepository; readonly policy: FootprintVisibilityPolicy; readonly maxResults?: number; }
export interface MapFootprintResult { readonly items: FootprintDto[]; readonly nextCursor: string | null; }

function validateBounds(bounds: MapBounds): void {
  if (![bounds.west, bounds.south, bounds.east, bounds.north].every(Number.isFinite) || bounds.south < -90 || bounds.north > 90 || bounds.south >= bounds.north || bounds.west >= bounds.east) throw new TypeError('Invalid map bounds');
}
function encodeCursor(item: FootprintPolicyInput): string { return Buffer.from(JSON.stringify({ publishedAt: item.publishedAt.toISOString(), id: item.id }), 'utf8').toString('base64url'); }
function decodeCursor(cursor: string): { publishedAt: string; id: string } | null { try { const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { publishedAt?: unknown; id?: unknown }; return typeof value.publishedAt === 'string' && typeof value.id === 'string' ? { publishedAt: value.publishedAt, id: value.id } : null; } catch { return null; } }

export class MapFootprintQuery {
  private readonly maxResults: number;
  constructor(private readonly options: MapFootprintQueryOptions) { this.maxResults = Math.max(1, Math.min(100, Math.floor(options.maxResults ?? 50))); }
  async execute(input: { readonly actor: ActorContext | null; readonly bounds: MapBounds; readonly cursor?: string; readonly visibility?: string }): Promise<MapFootprintResult> {
    validateBounds(input.bounds);
    const records = await this.options.repository.listInViewport({ bounds: input.bounds, ...(input.visibility ? { visibility: input.visibility } : {}) });
    const readable = await this.options.policy.readFilter(input.actor, records);
    const ordered = [...readable].sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime() || right.id.localeCompare(left.id));
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;
    const filtered = cursor ? ordered.filter((record) => record.publishedAt.toISOString() < cursor.publishedAt || (record.publishedAt.toISOString() === cursor.publishedAt && record.id < cursor.id)) : ordered;
    const page = filtered.slice(0, this.maxResults);
    const items: FootprintDto[] = [];
    for (const item of page) items.push(await this.options.policy.toPublicDto(input.actor, item));
    return { items, nextCursor: filtered.length > this.maxResults && page.length ? encodeCursor(page[page.length - 1] as FootprintPolicyInput) : null };
  }
}

export function createMemoryMapFootprintRepository(records: readonly FootprintPolicyInput[]): MapFootprintRepository {
  return { async listInViewport({ bounds, visibility }) { return records.filter((record) => record.displayPoint.lat >= bounds.south && record.displayPoint.lat <= bounds.north && record.displayPoint.lng >= bounds.west && record.displayPoint.lng <= bounds.east && (!visibility || record.visibility === visibility)); } };
}
