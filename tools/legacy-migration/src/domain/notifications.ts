import { createHash } from 'node:crypto';

import type { LegacyRecord } from '../adapters/fixture-source.js';
import { DeterministicIdRegistry } from './ids.js';
import { MigrationError } from './types.js';

const date = (value: unknown): Date => new Date(String(value));
const fingerprint = (value: string): string => createHash('sha256').update(value).digest('hex');

export function transformNotifications(
  notificationSources: readonly LegacyRecord[],
  pushSources: readonly LegacyRecord[],
  reportSources: readonly LegacyRecord[],
  userSources: readonly LegacyRecord[],
  keys: { readonly v1VapidPublicKey?: string; readonly v2VapidPublicKey?: string },
  ids = new DeterministicIdRegistry(),
) {
  const activePushSources = pushSources.filter((source) => source.migrationArchiveOnly !== true);
  if (activePushSources.length && (!keys.v1VapidPublicKey || !keys.v2VapidPublicKey || fingerprint(keys.v1VapidPublicKey) !== fingerprint(keys.v2VapidPublicKey))) {
    throw new MigrationError('VAPID_KEY_MISMATCH');
  }
  const notifications = notificationSources
    .filter((source) => source.migrationArchiveOnly !== true && (source.type === 'reaction' || source.type === 'comment'))
    .map((source) => {
      const id = ids.id('notification', String(source._id));
      return {
        id,
        recipientId: ids.id('user', String(source.recipientId)),
        type: String(source.type),
        actorId: source.senderId ? ids.id('user', String(source.senderId)) : null,
        targetType: 'footprint',
        targetId: ids.id('footprint', String(source.footprintId)),
        payload: { reference: ids.id('footprint', String(source.footprintId)) },
        readAt: source.isRead ? date(source.createdAt) : null,
        createdAt: date(source.createdAt),
        dedupeKey: id,
      };
    });
  const pushSubscriptions = activePushSources.map((source) => ({
    id: ids.id('push-subscription', String(source._id)),
    userId: ids.id('user', String(source.userId)),
    endpoint: String(source.endpoint),
    p256dh: String((source.keys as LegacyRecord).p256dh),
    auth: String((source.keys as LegacyRecord).auth),
    createdAt: date(source.createdAt ?? '2026-07-18T00:00:00.000Z'),
    updatedAt: date(source.createdAt ?? '2026-07-18T00:00:00.000Z'),
  }));
  const preferences = [...new Set(pushSubscriptions.map((source) => source.userId))].map((userId) => ({ userId, reactions: true, comments: true, social: true, messages: true, moderation: true, push: true, updatedAt: new Date('2026-07-18T00:00:00.000Z') }));
  const reports = reportSources.filter((source) => source.migrationArchiveOnly !== true && source.targetType === 'footprint').map((source) => ({
    id: ids.id('report', String(source._id)),
    footprintId: ids.id('footprint', String(source.footprintId)),
    reporterId: ids.id('user', String(source.reporterId)),
    reason: String(source.reason),
    details: source.details ? String(source.details) : null,
    status: source.status === 'actioned' ? 'resolved' as const : source.status === 'dismissed' ? 'dismissed' as const : 'open' as const,
    createdAt: date(source.createdAt),
    resolvedAt: source.reviewedAt ? date(source.reviewedAt) : null,
  }));
  const userSourceIds = new Set(userSources.map((source) => String(source._id)));
  const visitorsByPair = new Map<string, { ownerId: string; visitorId: string; visitCount: number; lastVisitedAt: Date }>();
  for (const owner of userSources) {
    for (const visit of Array.isArray(owner.profileVisitors) ? owner.profileVisitors as LegacyRecord[] : []) {
      const visitorSourceId = String(visit.visitorId);
      if (!userSourceIds.has(visitorSourceId)) throw new MigrationError('PROFILE_VISITOR_MISSING');
      const ownerId = ids.id('user', String(owner._id));
      const visitorId = ids.id('user', visitorSourceId);
      const key = `${ownerId}:${visitorId}`;
      const visitedAt = date(visit.visitedAt);
      const prior = visitorsByPair.get(key);
      visitorsByPair.set(key, prior
        ? { ...prior, visitCount: prior.visitCount + 1, lastVisitedAt: prior.lastVisitedAt > visitedAt ? prior.lastVisitedAt : visitedAt }
        : { ownerId, visitorId, visitCount: 1, lastVisitedAt: visitedAt });
    }
  }
  return {
    notifications,
    pushSubscriptions,
    preferences,
    reports,
    profileVisitors: [...visitorsByPair.values()],
    archivedOnly: {
      profileViewNotifications: notificationSources.filter((source) => source.type === 'profile_view').length,
      commentReports: reportSources.filter((source) => source.targetType === 'comment').length,
    },
    deliveryAttempts: [] as const,
    moderationCases: [] as const,
    moderationActions: [] as const,
    auditLogs: [] as const,
    memoryHighlights: [] as const,
    sessions: [] as const,
    devices: [] as const,
    securityEvents: [] as const,
    processedEvents: [] as const,
    outbox: [] as const,
  };
}
