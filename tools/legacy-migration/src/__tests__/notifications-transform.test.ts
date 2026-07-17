import { resolve } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { FixtureSource, type LegacyCollections } from '../adapters/fixture-source.js';
import { transformNotifications } from '../domain/notifications.js';

let source: LegacyCollections;
beforeEach(async () => { source = structuredClone(await (await FixtureSource.fromFile(resolve('fixtures/v1-complete.json'))).collections()); });

describe('legacy notifications and governance transformation', () => {
  it('maps supported notifications, push, footprint reports and visitor aggregates only', () => {
    const result = transformNotifications(source.Notification, source.PushSubscription, source.Report, source.User, {
      v1VapidPublicKey: 'same-public-key', v2VapidPublicKey: 'same-public-key',
    });
    expect(result.notifications.map((row) => row.type).sort()).toEqual(['comment', 'reaction', 'reaction']);
    expect(result.notifications.find((row) => row.type === 'comment')?.readAt?.toISOString()).toBe('2026-01-07T02:00:00.000Z');
    expect(result.notifications.find((row) => row.type === 'reaction')?.readAt).toBeNull();
    expect(JSON.stringify(result.notifications)).not.toContain('commented');
    expect(result.archivedOnly).toMatchObject({ profileViewNotifications: 1, commentReports: 1 });
    expect(result.pushSubscriptions).toHaveLength(1);
    expect(result.preferences[0]).toMatchObject({ reactions: true, comments: true, social: true, messages: true, moderation: true, push: true });
    expect(result.reports).toContainEqual(expect.objectContaining({ status: 'open', reason: 'spam' }));
    expect(result.profileVisitors).toContainEqual(expect.objectContaining({ visitCount: 1, lastVisitedAt: new Date('2026-01-09T00:00:00.000Z') }));
    expect(result.deliveryAttempts).toEqual([]);
    expect(result.moderationCases).toEqual([]);
    expect(result.auditLogs).toEqual([]);
    expect(result.sessions).toEqual([]);
    expect(result.outbox).toEqual([]);
  });

  it('blocks push migration when VAPID public-key fingerprints differ', () => {
    expect(() => transformNotifications(source.Notification, source.PushSubscription, source.Report, source.User, {
      v1VapidPublicKey: 'old-key', v2VapidPublicKey: 'new-key',
    })).toThrow('VAPID_KEY_MISMATCH');
  });

  it('includes self visits but blocks orphan visitors', () => {
    const visitors = source.User[0]!.profileVisitors as Array<Record<string, unknown>>;
    visitors.push({ visitorId: source.User[0]!._id, visitedAt: '2026-01-10T00:00:00.000Z' });
    const result = transformNotifications(source.Notification, [], source.Report, source.User, {});
    expect(result.profileVisitors.some((row) => row.ownerId === row.visitorId)).toBe(true);
    visitors.push({ visitorId: '507f1f77bcf86cd799439999', visitedAt: '2026-01-11T00:00:00.000Z' });
    expect(() => transformNotifications(source.Notification, [], source.Report, source.User, {})).toThrow('PROFILE_VISITOR_MISSING');
  });
});
