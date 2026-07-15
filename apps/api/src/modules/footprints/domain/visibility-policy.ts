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
  readonly privatePoint: GeoPoint;
  readonly displayPoint: GeoPoint;
  readonly visibility: Visibility;
  readonly locationPrecision: LocationPrecision;
  readonly publishedAt: Date;
  readonly discoveryExpiresAt: Date | null;
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
  };
}

export class FootprintVisibilityPolicy {
  constructor(private readonly ports: FootprintVisibilityPolicyPorts) {}

  async canRead(
    actor: ActorContext | null,
    footprintId: FootprintId,
  ): Promise<boolean> {
    const record = await this.ports.records.findById(footprintId);
    return record ? this.canReadRecord(actor, record) : false;
  }

  async readFilter(
    actor: ActorContext | null,
    records: readonly FootprintPolicyInput[],
  ): Promise<FootprintPolicyInput[]> {
    const decisions = await Promise.all(
      records.map((record) => this.canReadRecord(actor, record)),
    );
    return records.filter((_record, index) => decisions[index]);
  }

  async toPublicDto(
    actor: ActorContext | null,
    record: FootprintPolicyInput,
  ): Promise<FootprintDto> {
    if (!(await this.canReadRecord(actor, record))) {
      throw new FootprintAccessDeniedError();
    }
    return toDto(record);
  }

  async toOwnerDto(
    actor: ActorContext | null,
    record: FootprintPolicyInput,
  ): Promise<OwnerFootprintDto> {
    if (!actor || actor.userId !== record.authorId) {
      throw new FootprintAccessDeniedError();
    }
    return { ...toDto(record), privatePoint: { ...record.privatePoint } };
  }

  private async canReadRecord(
    actor: ActorContext | null,
    record: FootprintPolicyInput,
  ): Promise<boolean> {
    if (!actor) {
      return this.isActivePublicDiscovery(record);
    }
    if (actor.userId === record.authorId) {
      return true;
    }
    const actorId = parseUserId(actor.userId);
    if (
      isModerator(actor) &&
      (await this.ports.moderation.hasCaseAccess(actorId, record.id))
    ) {
      return true;
    }
    if (await this.ports.blocks.isEitherBlocked(actorId, record.authorId)) {
      return false;
    }
    if (
      (await this.ports.friendships.areAcceptedFriends(
        actorId,
        record.authorId,
      )) &&
      record.visibility !== 'private'
    ) {
      return true;
    }
    return this.isActivePublicDiscovery(record);
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
