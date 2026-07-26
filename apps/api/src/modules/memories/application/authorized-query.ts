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

interface TimelineCursor {
  readonly publishedAt: string;
  readonly id: string;
}

function encodeTimelineCursor(cursor: TimelineCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeTimelineCursor(value: string): TimelineCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<TimelineCursor>;
    if (typeof parsed.publishedAt !== 'string' || typeof parsed.id !== 'string') throw new TypeError();
    return { publishedAt: parsed.publishedAt, id: parsed.id };
  } catch {
    throw new TypeError('Invalid timeline cursor');
  }
}

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
    const decoded = cursor ? decodeTimelineCursor(cursor) : null;
    const filtered = decoded
      ? all.filter((item) => item.publishedAt < decoded.publishedAt
        || (item.publishedAt === decoded.publishedAt && item.id < decoded.id))
      : all;
    const items = filtered.slice(0, 50);
    const last = items.at(-1);
    return {
      items,
      nextCursor: filtered.length > items.length && last
        ? encodeTimelineCursor({ publishedAt: last.publishedAt, id: last.id })
        : null,
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

  async overview(ownerId: UserId, viewer: ActorContext | null) {
    const map = await this.readable(ownerId, viewer);
    const [media, visitors] = await Promise.all([
      this.media.listForFootprints(map.map((item) => item.id)),
      this.visitors(ownerId, viewer),
    ]);
    return {
      map,
      summary: {
        footprintCount: map.length,
        photoCount: media.length,
        visitorCount: visitors.length,
      },
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
    async overview() {
      return { summary: { footprintCount: 0, photoCount: 0, visitorCount: 0 }, map: [] };
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
