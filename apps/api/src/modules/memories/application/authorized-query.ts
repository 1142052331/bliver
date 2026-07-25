import type { UserId } from '@bliver/domain';

import type { ActorContext } from '../../identity/index.js';
import type { FootprintDto } from '../../footprints/index.js';
import type {
  MediaPageDto,
  MemoryMediaSource,
  MemoryQueryPort,
  MemoryRecordSource,
  MemoryVisibilityPolicy,
  MemoryVisitorDto,
  VisitorSource,
} from '../domain/ports.js';

const emptyMediaSource: MemoryMediaSource = {
  async listForFootprints() {
    return [];
  },
};

export class AuthorizedMemoryQuery implements MemoryQueryPort {
  constructor(
    private readonly source: MemoryRecordSource,
    private readonly policy: MemoryVisibilityPolicy,
    private readonly media: MemoryMediaSource = emptyMediaSource,
    private readonly visitorsSource: VisitorSource = new InMemoryVisitorSource(),
  ) {}

  private async readable(
    ownerId: UserId,
    viewer: ActorContext | null,
  ): Promise<FootprintDto[]> {
    const records = await this.source.listByOwner(ownerId);
    const allowed = await this.policy.historyFilter(viewer, records);
    const result: FootprintDto[] = [];
    for (const record of allowed) {
      result.push(await this.policy.toHistoryDto(viewer, record));
    }
    return result.sort(
      (left, right) =>
        right.publishedAt.localeCompare(left.publishedAt) || right.id.localeCompare(left.id),
    );
  }

  async map(ownerId: UserId, viewer: ActorContext | null): Promise<readonly FootprintDto[]> {
    return this.readable(ownerId, viewer);
  }

  async timeline(ownerId: UserId, viewer: ActorContext | null, cursor?: string) {
    const all = await this.readable(ownerId, viewer);
    const filtered = cursor ? all.filter((item) => item.publishedAt < cursor) : all;
    const items = filtered.slice(0, 50);
    return {
      items,
      nextCursor: filtered.length > items.length ? (items.at(-1)?.publishedAt ?? null) : null,
    };
  }

  async photos(
    ownerId: UserId,
    viewer: ActorContext | null,
    cursor?: string,
  ): Promise<MediaPageDto> {
    const readable = await this.readable(ownerId, viewer);
    const assets = await this.media.listForFootprints(readable.map((item) => item.id));
    const filtered = cursor
      ? assets.filter((item) => item.createdAt.toISOString() < cursor)
      : [...assets];
    const items = filtered
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, 50)
      .map((item) => ({
        assetId: item.assetId,
        footprintId: item.footprintId,
        url: item.url,
        createdAt: item.createdAt.toISOString(),
      }));
    return {
      items,
      nextCursor: filtered.length > items.length ? (items.at(-1)?.createdAt ?? null) : null,
    };
  }

  async visitors(ownerId: UserId, viewer: ActorContext | null) {
    if (!(await this.visitorsSource.isVisible(ownerId, viewer))) return [];
    return this.visitorsSource.list(ownerId);
  }

  async summary(ownerId: UserId, viewer: ActorContext | null) {
    const items = await this.readable(ownerId, viewer);
    const media = await this.media.listForFootprints(items.map((item) => item.id));
    const visitors = await this.visitors(ownerId, viewer);
    return {
      footprintCount: items.length,
      photoCount: media.length,
      visitorCount: visitors.length,
    };
  }

  async recordVisit(ownerId: UserId, visitorId: UserId) {
    if (ownerId !== visitorId) await this.visitorsSource.record(ownerId, visitorId);
  }
}

export function createMemoryMemoryRepository(): MemoryQueryPort {
  return {
    async map() { return []; },
    async timeline() { return { items: [], nextCursor: null }; },
    async photos() { return { items: [], nextCursor: null }; },
    async visitors() { return []; },
    async summary() {
      return { footprintCount: 0, photoCount: 0, visitorCount: 0 };
    },
    async recordVisit() {},
  };
}

export class InMemoryVisitorSource implements VisitorSource {
  private readonly values = new Map<string, Map<string, MemoryVisitorDto>>();
  private readonly hidden = new Set<string>();

  async list(ownerId: UserId) {
    return [...(this.values.get(ownerId)?.values() ?? [])].sort(
      (left, right) => right.visitedAt.localeCompare(left.visitedAt),
    );
  }

  async record(ownerId: UserId, visitorId: UserId) {
    const visitors = this.values.get(ownerId) ?? new Map();
    visitors.set(visitorId, {
      id: visitorId,
      name: visitorId,
      visitedAt: new Date().toISOString(),
    });
    this.values.set(ownerId, visitors);
  }

  async isVisible(ownerId: UserId, viewer: ActorContext | null) {
    return viewer?.userId === ownerId && !this.hidden.has(ownerId);
  }

  hide(ownerId: UserId) {
    this.hidden.add(ownerId);
  }
}
