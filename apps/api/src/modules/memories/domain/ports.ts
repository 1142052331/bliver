import type { FootprintId, UserId } from '@bliver/domain';

import type { ActorContext } from '../../identity/index.js';
import type {
  FootprintDto,
  FootprintPolicyInput,
} from '../../footprints/index.js';

export interface MediaPageDto {
  readonly items: readonly {
    assetId: string;
    footprintId: FootprintId;
    url: string;
    createdAt: string;
  }[];
  readonly nextCursor?: string | null;
}

export interface MemoryVisitorDto {
  readonly id: UserId;
  readonly name: string;
  readonly visitedAt: string;
}

export interface MemorySummaryDto {
  readonly footprintCount: number;
  readonly photoCount: number;
  readonly visitorCount: number;
}

export interface MemoryQueryPort {
  map(ownerId: UserId, viewer: ActorContext | null): Promise<readonly FootprintDto[]>;
  timeline(ownerId: UserId, viewer: ActorContext | null, cursor?: string): Promise<{
    items: readonly FootprintDto[];
    nextCursor?: string | null;
  }>;
  photos(ownerId: UserId, viewer: ActorContext | null, cursor?: string): Promise<MediaPageDto>;
  visitors(ownerId: UserId, viewer: ActorContext | null): Promise<readonly MemoryVisitorDto[]>;
  summary(ownerId: UserId, viewer: ActorContext | null): Promise<MemorySummaryDto>;
  recordVisit(ownerId: UserId, visitorId: UserId): Promise<void>;
}

export interface MemoryRecordSource {
  listByOwner(ownerId: UserId): Promise<readonly FootprintPolicyInput[]>;
  findById(id: FootprintId): Promise<FootprintPolicyInput | null>;
}

export interface MemoryMediaSource {
  listForFootprints(ids: readonly FootprintId[]): Promise<readonly {
    assetId: string;
    footprintId: FootprintId;
    url: string;
    createdAt: Date;
  }[]>;
}

export interface VisitorSource {
  list(ownerId: UserId): Promise<readonly MemoryVisitorDto[]>;
  record(ownerId: UserId, visitorId: UserId): Promise<void>;
  isVisible(ownerId: UserId, viewer: ActorContext | null): Promise<boolean>;
}

export interface MemoryVisibilityPolicy {
  historyFilter(
    actor: ActorContext | null,
    records: readonly FootprintPolicyInput[],
  ): Promise<FootprintPolicyInput[]>;
  toHistoryDto(
    actor: ActorContext | null,
    record: FootprintPolicyInput,
  ): Promise<FootprintDto>;
}

export interface MemoryProjectionEvent {
  readonly id: string;
  readonly type: string;
  readonly payload: Record<string, unknown>;
}
