import type { FootprintId, UserId } from '@bliver/domain';
import type { ActorContext } from '../../identity/index.js';
import { FootprintVisibilityPolicy, type FootprintPolicyInput, type FootprintDto } from '../../footprints/domain/visibility-policy.js';

export interface MediaPageDto { readonly items: readonly { assetId: string; footprintId: FootprintId; url: string; createdAt: string }[]; readonly nextCursor?: string | null; }
export interface MemoryVisitorDto { readonly id: UserId; readonly name: string; readonly visitedAt: string; }
export interface MemorySummaryDto { readonly footprintCount: number; readonly photoCount: number; readonly visitorCount: number; }
export interface MemoryQueryPort {
  map(ownerId: UserId, viewer: ActorContext | null): Promise<readonly FootprintDto[]>;
  timeline(ownerId: UserId, viewer: ActorContext | null, cursor?: string): Promise<{ items: readonly FootprintDto[]; nextCursor?: string | null }>;
  photos(ownerId: UserId, viewer: ActorContext | null, cursor?: string): Promise<MediaPageDto>;
  visitors(ownerId: UserId, viewer: ActorContext | null): Promise<readonly MemoryVisitorDto[]>;
  summary(ownerId: UserId, viewer: ActorContext | null): Promise<MemorySummaryDto>;
  recordVisit(ownerId: UserId, visitorId: UserId): Promise<void>;
}
export interface MemoryRecordSource { listByOwner(ownerId: UserId): Promise<readonly FootprintPolicyInput[]>; findById(id: FootprintId): Promise<FootprintPolicyInput | null>; }
export interface MemoryMediaSource { listForFootprints(ids: readonly FootprintId[]): Promise<readonly { assetId: string; footprintId: FootprintId; url: string; createdAt: Date }[]>; }
export interface VisitorSource { list(ownerId: UserId): Promise<readonly MemoryVisitorDto[]>; record(ownerId: UserId, visitorId: UserId): Promise<void>; isVisible(ownerId: UserId, viewer: ActorContext | null): Promise<boolean>; }

export interface MemoryProjectionEvent { readonly id: string; readonly type: string; readonly payload: Record<string, unknown>; }

export class AuthorizedMemoryQuery implements MemoryQueryPort {
  constructor(private readonly source: MemoryRecordSource, private readonly policy: FootprintVisibilityPolicy, private readonly media: MemoryMediaSource = { async listForFootprints() { return []; } }, private readonly visitorsSource: VisitorSource = new InMemoryVisitorSource()) {}
  private async readable(ownerId: UserId, viewer: ActorContext | null): Promise<FootprintDto[]> {
    const records = await this.source.listByOwner(ownerId);
    const allowed = await this.policy.historyFilter(viewer, records);
    const result: FootprintDto[] = [];
    for (const record of allowed) result.push(await this.policy.toHistoryDto(viewer, record));
    return result.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.id.localeCompare(a.id));
  }
  async map(ownerId: UserId, viewer: ActorContext | null): Promise<readonly FootprintDto[]> { return this.readable(ownerId, viewer); }
  async timeline(ownerId: UserId, viewer: ActorContext | null, cursor?: string) { const all = await this.readable(ownerId, viewer); const filtered = cursor ? all.filter((item) => item.publishedAt < cursor) : all; const items = filtered.slice(0, 50); return { items, nextCursor: filtered.length > items.length ? (items.at(-1)?.publishedAt ?? null) : null }; }
  async photos(ownerId: UserId, viewer: ActorContext | null, cursor?: string): Promise<MediaPageDto> { const readable = await this.readable(ownerId, viewer); const ids = readable.map((item) => item.id); const assets = await this.media.listForFootprints(ids); const filtered = cursor ? assets.filter((item) => item.createdAt.toISOString() < cursor) : [...assets]; const items = filtered.sort((a: { createdAt: Date }, b: { createdAt: Date }) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 50).map((item: { assetId: string; footprintId: FootprintId; url: string; createdAt: Date }) => ({ assetId: item.assetId, footprintId: item.footprintId, url: item.url, createdAt: item.createdAt.toISOString() })); return { items, nextCursor: filtered.length > items.length ? (items.at(-1)?.createdAt ?? null) : null }; }
  async visitors(ownerId: UserId, viewer: ActorContext | null) { if (!(await this.visitorsSource.isVisible(ownerId, viewer))) return []; return this.visitorsSource.list(ownerId); }
  async summary(ownerId: UserId, viewer: ActorContext | null) { const items = await this.readable(ownerId, viewer); const media = await this.media.listForFootprints(items.map((item) => item.id)); const visitors = await this.visitors(ownerId, viewer); return { footprintCount: items.length, photoCount: media.length, visitorCount: visitors.length }; }
  async recordVisit(ownerId: UserId, visitorId: UserId) { if (ownerId !== visitorId) await this.visitorsSource.record(ownerId, visitorId); }
}

export function createMemoryMemoryRepository(): MemoryQueryPort {
  const policy = new FootprintVisibilityPolicy({
    records: { async findById() { return null; } },
    friendships: { async areAcceptedFriends() { return false; } },
    blocks: { async isEitherBlocked() { return false; } },
    moderation: { async hasCaseAccess() { return false; } },
    now: () => new Date(),
  });
  return new AuthorizedMemoryQuery({ async listByOwner() { return []; }, async findById() { return null; } }, policy);
}

export class InMemoryVisitorSource implements VisitorSource {
  private readonly values = new Map<string, Map<string, MemoryVisitorDto>>();
  private readonly hidden = new Set<string>();
  async list(ownerId: UserId) { return [...(this.values.get(ownerId)?.values() ?? [])].sort((a, b) => b.visitedAt.localeCompare(a.visitedAt)); }
  async record(ownerId: UserId, visitorId: UserId) { const map = this.values.get(ownerId) ?? new Map(); map.set(visitorId, { id: visitorId, name: visitorId, visitedAt: new Date().toISOString() }); this.values.set(ownerId, map); }
  async isVisible(ownerId: UserId, viewer: ActorContext | null) { return viewer?.userId === ownerId && !this.hidden.has(ownerId); }
  hide(ownerId: UserId) { this.hidden.add(ownerId); }
}
