import type { ActorContext } from '../../identity/index.js';
import type { FootprintDto, FootprintPolicyInput } from '../../footprints/index.js';
import type { ActivityQuery } from '@bliver/contracts';

export type DiscoveryScope = 'region' | 'country' | 'global';

export interface DiscoveryEntry extends FootprintPolicyInput {
  readonly message?: string;
  readonly hasMedia?: boolean;
  readonly regionId?: string | null;
  readonly countryCode?: string | null;
  readonly deletedAt?: Date | null;
}

export interface DiscoveryCandidateQuery {
  readonly scope: DiscoveryScope;
  readonly actorId: string | null;
  readonly regionId?: string | null;
  readonly countryCode?: string | null;
  readonly excludeRegionId?: string | null;
  readonly excludeCountryCode?: string | null;
  readonly query?: string;
  readonly relationship: ActivityQuery['relationship'];
  readonly content: ActivityQuery['content'];
  readonly cursor?: { readonly publishedAt: string; readonly id: string };
  readonly limit: number;
}

export interface DiscoveryRepository {
  listCandidates(input: DiscoveryCandidateQuery): Promise<DiscoveryEntry[]>;
  upsert(entry: DiscoveryEntry): Promise<void>;
  remove(footprintId: string): Promise<void>;
}

export interface DiscoveryQueryInput extends ActivityQuery {
  readonly actor: ActorContext | null;
  readonly regionId?: string | null;
  readonly countryCode?: string | null;
}

export interface ActivityPageDto {
  readonly items: FootprintDto[];
  readonly nextCursor?: string;
  readonly resolvedScope: DiscoveryScope;
}

export interface DiscoveryQueryOptions {
  readonly repository: DiscoveryRepository;
  readonly policy: { readFilter(actor: ActorContext | null, records: readonly DiscoveryEntry[]): Promise<DiscoveryEntry[]>; toPublicDto(actor: ActorContext | null, record: DiscoveryEntry): Promise<FootprintDto> };
  readonly now?: () => Date;
  readonly cursorSecret?: string;
  readonly maxLimit?: number;
}
