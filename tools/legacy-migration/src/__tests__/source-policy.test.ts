import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FixtureSource } from '../adapters/fixture-source.js';
import { preflight } from '../domain/preflight.js';
import { applyPreservationPolicy } from '../domain/source-policy.js';

describe('real-source preservation policy', () => {
  it('keeps legacy login names, recovers comment authors and isolates dangling data', async () => {
    const source = structuredClone(await (await FixtureSource.fromFile(resolve('fixtures/v1-complete.json'))).collections());
    source.User[0]!.name = '阿森';
    const comment = (source.Footprint[0]!.comments as Array<Record<string, unknown>>)[0]!;
    delete comment.userId;
    comment.username = 'legacy_friend';
    source.Friendship[0]!.recipient = '507f1f77bcf86cd799439999';
    source.Notification.push({ _id: '507f1f77bcf86cd799439991', type: 'reaction', footprintId: '507f1f77bcf86cd799439998' });
    source.PushSubscription.push({ _id: '507f1f77bcf86cd799439992', userId: '507f1f77bcf86cd799439997' });
    source.Report.push({ _id: '507f1f77bcf86cd799439993', targetType: 'footprint', footprintId: '507f1f77bcf86cd799439996', reporterId: source.User[0]!._id });

    const policy = applyPreservationPolicy(source);
    const result = preflight(policy.collections);

    expect(result.errors).toEqual([]);
    expect(policy).toMatchObject({
      recoveredCommentAuthors: 1,
      tombstoneUsers: 1,
      archivedDanglingNotifications: 1,
      archivedDanglingPushSubscriptions: 1,
      archivedDanglingReports: 1,
    });
    expect(policy.collections.User.find((user) => user.migrationSynthetic)?.password).toBeUndefined();
  });
});
