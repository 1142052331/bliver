import type { LegacyCollections } from '../adapters/fixture-source.js';
import type { VerifiedMedia } from '../adapters/cloudinary.js';
import { canonicalDigest } from './digests.js';
import { transformConversations } from './conversations.js';
import { transformFootprints } from './footprints.js';
import { transformIdentity } from './identity.js';
import { transformInteractions } from './interactions.js';
import { transformNotifications } from './notifications.js';
import { transformSocial } from './social.js';

export interface MigrationPlan {
  readonly rows: Record<string, unknown>;
  readonly digest: string;
  readonly sideEffects: { readonly outbox: 0; readonly sockets: 0; readonly push: 0; readonly audit: 0 };
}

export function buildMigrationPlan(collections: LegacyCollections, verifiedMedia: ReadonlyMap<string, VerifiedMedia>, keys: { readonly v1VapidPublicKey?: string; readonly v2VapidPublicKey?: string } = {}): MigrationPlan {
  const identity = transformIdentity(collections.User);
  const footprints = transformFootprints(collections.Footprint, verifiedMedia);
  const interactions = transformInteractions(collections.FootprintRead, collections.Footprint);
  const social = transformSocial(collections.Friendship, collections.Block);
  const conversations = transformConversations(collections.Conversation, collections.Message);
  const notifications = transformNotifications(collections.Notification, collections.PushSubscription, collections.Report, collections.User, keys);
  const rows = { identityUsers: identity.users, identityCredentials: identity.credentials, identityRoles: identity.roles, adminRoles: identity.adminRoles, ...footprints, ...interactions, ...social, ...conversations, ...notifications };
  return { rows, digest: canonicalDigest(rows), sideEffects: { outbox: 0, sockets: 0, push: 0, audit: 0 } };
}
