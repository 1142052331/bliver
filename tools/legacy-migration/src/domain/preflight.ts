import type { LegacyCollections, LegacyModel, LegacyRecord } from '../adapters/fixture-source.js';

export interface PreflightIssue { readonly code: string; readonly collection: LegacyModel }
export interface PreflightResult {
  readonly summary: { readonly source: number; readonly migrated: number; readonly archivedOnly: number; readonly blocked: number };
  readonly errors: readonly PreflightIssue[];
  readonly defaultedVisibilityCount: number;
}

const archivedCollections = new Set<LegacyModel>([
  'AdminBootstrap', 'Announcement', 'AuditLog', 'BackfillDiscoveryWindow', 'Feedback',
]);
const bcryptPattern = /^\$2[aby]\$(?:0[89]|1[0-4])\$[./A-Za-z0-9]{53}$/;
const objectId = (record: LegacyRecord): string => String(record._id ?? '');
const ref = (record: LegacyRecord, key: string): string => String(record[key] ?? '');

function isArchivedOnly(collection: LegacyModel, row: LegacyRecord): boolean {
  if (row.migrationArchiveOnly === true) return true;
  if (archivedCollections.has(collection)) return true;
  if (collection === 'Notification') return row.type === 'profile_view';
  if (collection === 'Report') return row.targetType === 'comment';
  return false;
}

export function preflight(collections: LegacyCollections): PreflightResult {
  const errors: PreflightIssue[] = [];
  const blocked = new Set<string>();
  const add = (code: string, collection: LegacyModel, row: LegacyRecord) => {
    errors.push({ code, collection });
    blocked.add(`${collection}:${objectId(row)}`);
  };
  const users = new Set(collections.User.map(objectId));
  const footprints = new Set(collections.Footprint.map(objectId));
  const conversations = new Set(collections.Conversation.map(objectId));
  const usernames = new Set<string>();
  let defaultedVisibilityCount = 0;

  for (const user of collections.User) {
    const name = String(user.name ?? '');
    if (name !== name.trim() || !/^[^\u0000-\u001f\u007f]{1,32}$/u.test(name)) add('USERNAME_V2_INCOMPATIBLE', 'User', user);
    if (usernames.has(name)) add('USERNAME_DUPLICATE', 'User', user);
    usernames.add(name);
    if (user.migrationSynthetic !== true && !bcryptPattern.test(String(user.password ?? ''))) add('BCRYPT_HASH_INVALID', 'User', user);
    for (const visitor of Array.isArray(user.profileVisitors) ? user.profileVisitors as LegacyRecord[] : []) {
      if (!users.has(ref(visitor, 'visitorId'))) add('PROFILE_VISITOR_MISSING', 'User', user);
    }
  }

  for (const footprint of collections.Footprint) {
    if (!users.has(ref(footprint, 'userId'))) add('FOOTPRINT_AUTHOR_MISSING', 'Footprint', footprint);
    const location = footprint.location as { lat?: unknown; lng?: unknown } | undefined;
    const lat = Number(location?.lat); const lng = Number(location?.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) add('FOOTPRINT_COORDINATES_INVALID', 'Footprint', footprint);
    if (footprint.visibility === undefined) defaultedVisibilityCount += 1;
    else if (!['public', 'friends', 'private'].includes(String(footprint.visibility))) add('FOOTPRINT_VISIBILITY_INVALID', 'Footprint', footprint);
    const reactions = Array.isArray(footprint.reactions) ? footprint.reactions as LegacyRecord[] : [];
    const byActor = new Map<string, LegacyRecord>();
    for (const reaction of reactions) {
      const actor = ref(reaction, 'userId');
      if (!users.has(actor)) add('REACTION_AUTHOR_MISSING', 'Footprint', footprint);
      const prior = byActor.get(actor);
      if (prior && (prior.emoji !== reaction.emoji || prior.createdAt !== reaction.createdAt)) add('REACTION_CONFLICT', 'Footprint', footprint);
      else byActor.set(actor, reaction);
    }
    const comments = Array.isArray(footprint.comments) ? footprint.comments as LegacyRecord[] : [];
    const commentIds = new Set(comments.map(objectId));
    for (const comment of comments) {
      if (!users.has(ref(comment, 'userId'))) add('COMMENT_AUTHOR_MISSING', 'Footprint', footprint);
      const parent = comment.parentCommentId;
      if (parent && !commentIds.has(String(parent))) add('COMMENT_PARENT_MISSING', 'Footprint', footprint);
      const content = String(comment.content ?? '');
      if (!comment.isDeleted && (content.length < 1 || content.length > 2000)) add('COMMENT_CONTENT_INVALID', 'Footprint', footprint);
    }
  }

  for (const row of collections.FootprintRead) {
    if (!users.has(ref(row, 'userId')) || !footprints.has(ref(row, 'footprintId'))) add('FOOTPRINT_READ_ORPHAN', 'FootprintRead', row);
  }
  for (const row of collections.Friendship) {
    if (!users.has(ref(row, 'requester')) || !users.has(ref(row, 'recipient'))) add('FRIENDSHIP_USER_MISSING', 'Friendship', row);
    if (ref(row, 'requester') === ref(row, 'recipient')) add('FRIENDSHIP_SELF', 'Friendship', row);
  }
  for (const row of collections.Block) {
    if (!users.has(ref(row, 'blockerId')) || !users.has(ref(row, 'blockedId'))) add('BLOCK_USER_MISSING', 'Block', row);
    if (ref(row, 'blockerId') === ref(row, 'blockedId')) add('BLOCK_SELF', 'Block', row);
  }
  for (const row of collections.Conversation) {
    if (!users.has(ref(row, 'userA')) || !users.has(ref(row, 'userB'))) add('CONVERSATION_USER_MISSING', 'Conversation', row);
  }
  for (const row of collections.Message) {
    if (!users.has(ref(row, 'senderId')) || !users.has(ref(row, 'receiverId'))) add('MESSAGE_USER_MISSING', 'Message', row);
    if (row.conversationId && !conversations.has(String(row.conversationId))) add('MESSAGE_CONVERSATION_MISSING', 'Message', row);
  }
  for (const row of collections.Notification) {
    if (row.migrationArchiveOnly === true) continue;
    if (!users.has(ref(row, 'recipientId')) || (row.senderId && !users.has(ref(row, 'senderId')))) add('NOTIFICATION_USER_MISSING', 'Notification', row);
    if (row.type !== 'profile_view' && !footprints.has(ref(row, 'footprintId'))) add('NOTIFICATION_FOOTPRINT_MISSING', 'Notification', row);
  }
  for (const row of collections.PushSubscription) if (row.migrationArchiveOnly !== true && !users.has(ref(row, 'userId'))) add('PUSH_USER_MISSING', 'PushSubscription', row);
  for (const row of collections.Report) {
    if (row.migrationArchiveOnly === true) continue;
    if (!users.has(ref(row, 'reporterId')) || !footprints.has(ref(row, 'footprintId'))) add('REPORT_REFERENCE_MISSING', 'Report', row);
  }

  let source = 0; let migrated = 0; let archivedOnly = 0;
  for (const [collection, rows] of Object.entries(collections) as Array<[LegacyModel, LegacyRecord[]]>) {
    for (const row of rows) {
      if (row.migrationSynthetic === true) continue;
      source += 1;
      if (blocked.has(`${collection}:${objectId(row)}`)) continue;
      if (isArchivedOnly(collection, row)) archivedOnly += 1;
      else migrated += 1;
    }
  }
  return { summary: { source, migrated, archivedOnly, blocked: source - migrated - archivedOnly }, errors, defaultedVisibilityCount };
}
