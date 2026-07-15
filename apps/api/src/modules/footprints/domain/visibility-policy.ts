import {
  canDiscover,
  parseUserId,
  type FootprintId,
  type UserId,
  type Visibility,
} from '@bliver/domain';

import type { ActorContext } from '../../identity/index.js';
import type { GeoPoint, LocationPrecision } from './location-privacy.js';

export interface FootprintAuthorInput {
  readonly name: string;
  readonly avatarUrl?: string;
}

export interface FootprintPolicyInput {
  readonly id: FootprintId;
  readonly authorId: UserId;
  readonly author: FootprintAuthorInput;
  readonly displayPoint: GeoPoint;
  readonly visibility: Visibility;
  readonly locationPrecision: LocationPrecision;
  readonly publishedAt: Date;
  readonly discoveryExpiresAt: Date | null;
  readonly message?: string;
}

export type FootprintPublicPolicyInput = FootprintPolicyInput;

export interface FootprintOwnerPolicyInput extends FootprintPolicyInput {
  readonly privatePoint: GeoPoint;
}

export interface FootprintDto {
  readonly id: FootprintId;
  readonly author: {
    readonly id: UserId;
    readonly name: string;
    readonly avatarUrl?: string;
  };
  readonly displayPoint: GeoPoint;
  readonly visibility: Visibility;
  readonly locationPrecision: LocationPrecision;
  readonly publishedAt: string;
  readonly discoveryExpiresAt?: string;
  readonly message?: string;
}

export interface OwnerFootprintDto extends FootprintDto {
  readonly privatePoint: GeoPoint;
}

export interface FootprintPolicyRecordPort {
  findById(id: FootprintId): Promise<FootprintPolicyInput | null>;
}

export interface AcceptedFriendshipPort {
  areAcceptedFriends(viewerId: UserId, authorId: UserId): Promise<boolean>;
}

export interface BlockRelationshipPort {
  isEitherBlocked(viewerId: UserId, authorId: UserId): Promise<boolean>;
}

export interface ModerationCaseAccessPort {
  hasCaseAccess(viewerId: UserId, footprintId: FootprintId): Promise<boolean>;
}

export interface FootprintVisibilityPolicyPorts {
  readonly records: FootprintPolicyRecordPort;
  readonly friendships: AcceptedFriendshipPort;
  readonly blocks: BlockRelationshipPort;
  readonly moderation: ModerationCaseAccessPort;
  readonly now: () => Date;
}

export interface FootprintVisibilityPolicyOptions {
  readonly maxReadFilterConcurrency?: number;
  readonly denyAuthenticatedNonOwners?: boolean;
}

export class FootprintAccessDeniedError extends Error {
  readonly code = 'FOOTPRINT_ACCESS_DENIED';

  constructor() {
    super('Footprint access denied');
    this.name = 'FootprintAccessDeniedError';
  }
}

function isModerator(actor: ActorContext): boolean {
  return actor.roles.some((role) => role === 'moderator' || role === 'admin');
}

function toDto(record: FootprintPolicyInput): FootprintDto {
  return {
    id: record.id,
    author: {
      id: record.authorId,
      name: record.author.name,
      ...(record.author.avatarUrl
        ? { avatarUrl: record.author.avatarUrl }
        : {}),
    },
    displayPoint: { ...record.displayPoint },
    visibility: record.visibility,
    locationPrecision: record.locationPrecision,
    publishedAt: record.publishedAt.toISOString(),
    ...(record.discoveryExpiresAt
      ? { discoveryExpiresAt: record.discoveryExpiresAt.toISOString() }
      : {}),
    ...(record.message !== undefined ? { message: record.message } : {}),
  };
}

interface RelationshipDecision {
  readonly blocked: boolean;
  readonly friend: boolean;
  readonly failed: boolean;
}

interface ReadFilterCaches {
  readonly relationships: Map<string, Promise<RelationshipDecision>>;
  readonly moderationCases: Map<string, Promise<boolean>>;
}

async function mapWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  callback: (value: T, index: number) => Promise<boolean>,
): Promise<boolean[]> {
  const results = Array.from({ length: values.length }, () => false);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      try {
        results[index] = await callback(values[index] as T, index);
      } catch {
        results[index] = false;
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      () => worker(),
    ),
  );
  return results;
}

export class FootprintVisibilityPolicy {
  private readonly maxReadFilterConcurrency: number;
  private readonly denyAuthenticatedNonOwners: boolean;

  constructor(
    private readonly ports: FootprintVisibilityPolicyPorts,
    options: FootprintVisibilityPolicyOptions = {},
  ) {
    const configured = options.maxReadFilterConcurrency ?? 8;
    this.maxReadFilterConcurrency = Number.isFinite(configured)
      ? Math.max(1, Math.min(32, Math.floor(configured)))
      : 8;
    this.denyAuthenticatedNonOwners = options.denyAuthenticatedNonOwners ?? false;
  }

  async canRead(
    actor: ActorContext | null,
    footprintId: FootprintId,
  ): Promise<boolean> {
    const record = await this.ports.records.findById(footprintId);
    return record ? this.isReadable(actor, record) : false;
  }

  async readFilter(
    actor: ActorContext | null,
    records: readonly FootprintPolicyInput[],
  ): Promise<FootprintPolicyInput[]> {
    let actorId: UserId | null = null;
    if (actor) {
      try {
        actorId = parseUserId(actor.userId);
      } catch {
        return [];
      }
    }
    const caches: ReadFilterCaches = {
      relationships: new Map(),
      moderationCases: new Map(),
    };
    const decisions = await mapWithConcurrency(
      records,
      this.maxReadFilterConcurrency,
      (record) => this.canReadRecord(actor, record, actorId, caches),
    );
    return records.filter((_record, index) => decisions[index]);
  }

  async toPublicDto(
    actor: ActorContext | null,
    record: FootprintPolicyInput,
  ): Promise<FootprintDto> {
    if (!(await this.isReadable(actor, record))) {
      throw new FootprintAccessDeniedError();
    }
    return toDto(record);
  }

  async toOwnerDto(
    actor: ActorContext | null,
    record: FootprintOwnerPolicyInput,
  ): Promise<OwnerFootprintDto> {
    if (!actor) {
      throw new FootprintAccessDeniedError();
    }
    let actorId: UserId;
    try {
      actorId = parseUserId(actor.userId);
    } catch {
      throw new FootprintAccessDeniedError();
    }
    if (actorId !== record.authorId) throw new FootprintAccessDeniedError();
    return { ...toDto(record), privatePoint: { ...record.privatePoint } };
  }

  private async isReadable(
    actor: ActorContext | null,
    record: FootprintPolicyInput,
  ): Promise<boolean> {
    let actorId: UserId | null = null;
    if (actor) {
      try {
        actorId = parseUserId(actor.userId);
      } catch {
        return false;
      }
    }
    try {
      return await this.canReadRecord(actor, record, actorId);
    } catch {
      return false;
    }
  }

  private async canReadRecord(
    actor: ActorContext | null,
    record: FootprintPolicyInput,
    actorId: UserId | null,
    caches?: ReadFilterCaches,
  ): Promise<boolean> {
    if (!actor) {
      return this.isActivePublicDiscovery(record);
    }
    if (actor.userId === record.authorId) {
      return true;
    }
    if (this.denyAuthenticatedNonOwners) return false;
    if (!actorId) return false;
    if (
      isModerator(actor) &&
      (await this.moderationCaseAccess(actorId, record.id, caches))
    ) {
      return true;
    }
    const relationship = await this.relationshipAccess(
      actorId,
      record.authorId,
      caches,
    );
    if (relationship.failed || relationship.blocked) return false;
    if (relationship.friend && record.visibility !== 'private') {
      return true;
    }
    return this.isActivePublicDiscovery(record);
  }

  private async relationshipAccess(
    actorId: UserId,
    authorId: UserId,
    caches?: ReadFilterCaches,
  ): Promise<RelationshipDecision> {
    const key = `${actorId}:${authorId}`;
    const cached = caches?.relationships.get(key);
    if (cached) return cached;
    const relationship = this.loadRelationship(actorId, authorId);
    caches?.relationships.set(key, relationship);
    return relationship;
  }

  private async loadRelationship(
    actorId: UserId,
    authorId: UserId,
  ): Promise<RelationshipDecision> {
    try {
      const blocked = await this.ports.blocks.isEitherBlocked(actorId, authorId);
      if (blocked) return { blocked: true, friend: false, failed: false };
      const friend = await this.ports.friendships.areAcceptedFriends(
        actorId,
        authorId,
      );
      return { blocked: false, friend, failed: false };
    } catch {
      return { blocked: true, friend: false, failed: true };
    }
  }

  private async moderationCaseAccess(
    actorId: UserId,
    footprintId: FootprintId,
    caches?: ReadFilterCaches,
  ): Promise<boolean> {
    const cached = caches?.moderationCases.get(footprintId);
    if (cached) return cached;
    const access = this.ports.moderation
      .hasCaseAccess(actorId, footprintId)
      .catch(() => false);
    caches?.moderationCases.set(footprintId, access);
    return access;
  }

  private isActivePublicDiscovery(record: FootprintPolicyInput): boolean {
    return Boolean(
      record.discoveryExpiresAt &&
        canDiscover(
          {
            visibility: record.visibility,
            discoveryExpiresAt: record.discoveryExpiresAt,
          },
          this.ports.now(),
        ),
    );
  }
}
