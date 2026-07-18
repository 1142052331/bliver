import { createHash } from 'node:crypto';

import type { LegacyCollections, LegacyRecord } from '../adapters/fixture-source.js';

const policyTimestamp = '2026-07-18T00:00:00.000Z';
const ref = (row: LegacyRecord, key: string): string => String(row[key] ?? '');

function tombstoneUsername(sourceId: string): string {
  return `deleted_${createHash('sha256').update(sourceId).digest('hex').slice(0, 16)}`;
}

export interface SourcePolicyResult {
  readonly collections: LegacyCollections;
  readonly recoveredCommentAuthors: number;
  readonly defaultedReactionTimestamps: number;
  readonly tombstoneUsers: number;
  readonly archivedDanglingNotifications: number;
  readonly archivedDanglingPushSubscriptions: number;
  readonly archivedDanglingReports: number;
}

function cloneCollections(source: LegacyCollections): LegacyCollections {
  return Object.fromEntries(Object.entries(source).map(([model, rows]) => [model, rows.map((row) => {
    const copy = { ...row };
    if (Array.isArray(row.comments)) copy.comments = row.comments.map((value) => ({ ...(value as LegacyRecord) }));
    if (Array.isArray(row.reactions)) copy.reactions = row.reactions.map((value) => ({ ...(value as LegacyRecord) }));
    if (Array.isArray(row.profileVisitors)) copy.profileVisitors = row.profileVisitors.map((value) => ({ ...(value as LegacyRecord) }));
    return copy;
  })])) as LegacyCollections;
}

export function applyPreservationPolicy(source: LegacyCollections): SourcePolicyResult {
  const collections = cloneCollections(source);
  const userIds = new Set(collections.User.map((row) => String(row._id)));
  const usersByName = new Map<string, LegacyRecord[]>();
  for (const user of collections.User) {
    const name = String(user.name ?? '');
    usersByName.set(name, [...(usersByName.get(name) ?? []), user]);
  }
  const footprintIds = new Set(collections.Footprint.map((row) => String(row._id)));
  const missingUserIds = new Set<string>();
  const retainIdentity = (value: string) => { if (value && !userIds.has(value)) missingUserIds.add(value); };

  let recoveredCommentAuthors = 0;
  let defaultedReactionTimestamps = 0;
  for (const footprint of collections.Footprint) {
    retainIdentity(ref(footprint, 'userId'));
    for (const row of (Array.isArray(footprint.comments) ? footprint.comments : []) as LegacyRecord[]) {
      if (!row.userId) {
        const matches = usersByName.get(String(row.username ?? '')) ?? [];
        if (matches.length === 1) {
          row.userId = matches[0]!._id;
          recoveredCommentAuthors += 1;
        }
      }
      retainIdentity(ref(row, 'userId'));
    }
    for (const row of (Array.isArray(footprint.reactions) ? footprint.reactions : []) as LegacyRecord[]) {
      if (!row.createdAt) {
        row.createdAt = footprint.createdAt;
        defaultedReactionTimestamps += 1;
      }
      retainIdentity(ref(row, 'userId'));
    }
  }
  for (const row of collections.FootprintRead) retainIdentity(ref(row, 'userId'));
  for (const row of collections.Friendship) { retainIdentity(ref(row, 'requester')); retainIdentity(ref(row, 'recipient')); }
  for (const row of collections.Block) { retainIdentity(ref(row, 'blockerId')); retainIdentity(ref(row, 'blockedId')); }
  for (const row of collections.Conversation) { retainIdentity(ref(row, 'userA')); retainIdentity(ref(row, 'userB')); }
  for (const row of collections.Message) { retainIdentity(ref(row, 'senderId')); retainIdentity(ref(row, 'receiverId')); }
  for (const row of collections.Notification) {
    if (footprintIds.has(ref(row, 'footprintId')) || row.type === 'profile_view') {
      retainIdentity(ref(row, 'recipientId'));
      if (row.senderId) retainIdentity(ref(row, 'senderId'));
    }
  }
  for (const row of collections.Report) {
    if (footprintIds.has(ref(row, 'footprintId'))) retainIdentity(ref(row, 'reporterId'));
  }

  for (const sourceId of [...missingUserIds].sort()) {
    collections.User.push({
      _id: sourceId,
      name: tombstoneUsername(sourceId),
      role: 'user',
      createdAt: policyTimestamp,
      updatedAt: policyTimestamp,
      profileVisitors: [],
      migrationSynthetic: true,
    });
  }

  let archivedDanglingNotifications = 0;
  for (const row of collections.Notification) {
    if (row.type !== 'profile_view' && !footprintIds.has(ref(row, 'footprintId'))) {
      row.migrationArchiveOnly = true;
      archivedDanglingNotifications += 1;
    }
  }
  let archivedDanglingPushSubscriptions = 0;
  for (const row of collections.PushSubscription) {
    if (!userIds.has(ref(row, 'userId'))) {
      row.migrationArchiveOnly = true;
      archivedDanglingPushSubscriptions += 1;
    }
  }
  let archivedDanglingReports = 0;
  for (const row of collections.Report) {
    if (!footprintIds.has(ref(row, 'footprintId')) || !userIds.has(ref(row, 'reporterId'))) {
      row.migrationArchiveOnly = true;
      archivedDanglingReports += 1;
    }
  }

  return {
    collections,
    recoveredCommentAuthors,
    defaultedReactionTimestamps,
    tombstoneUsers: missingUserIds.size,
    archivedDanglingNotifications,
    archivedDanglingPushSubscriptions,
    archivedDanglingReports,
  };
}
