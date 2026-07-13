import { describe, expect, it } from 'vitest';
import { buildCommentTree, commentPermissions, footprintPermissions } from '../footprintConversation';

const rootOld = { _id: 'root-old', createdAt: '2026-07-11T08:00:00.000Z', userId: 'u1', content: 'old' };
const rootNew = { _id: 'root-new', createdAt: '2026-07-11T09:00:00.000Z', userId: 'u2', content: 'new' };
const reply = {
  _id: 'reply-old', createdAt: '2026-07-11T08:30:00.000Z', userId: 'u3',
  parentCommentId: 'root-old', replyToCommentId: 'root-old', content: 'reply',
};

describe('footprint conversation domain', () => {
  it('groups and sorts flat legacy-compatible comments', () => {
    expect(buildCommentTree([rootNew, reply, rootOld])).toEqual([
      { ...rootOld, replies: [reply] },
      { ...rootNew, replies: [] },
    ]);
  });

  it('grants delete only to the comment author or admin', () => {
    expect(commentPermissions({ comment: rootOld, viewerId: 'u1', isAdmin: false }))
      .toEqual({ canDelete: true, canReport: false });
    expect(commentPermissions({ comment: rootOld, viewerId: 'u2', isAdmin: false }))
      .toEqual({ canDelete: false, canReport: true });
    expect(commentPermissions({ comment: rootOld, viewerId: 'u2', isAdmin: true }))
      .toEqual({ canDelete: true, canReport: false });
  });

  it('hides report for owned footprint and shows it for eligible strangers', () => {
    expect(footprintPermissions({ footprint: { userId: 'u1' }, viewerId: 'u1', isAdmin: false }))
      .toEqual({ canDelete: false, canReport: false });
    expect(footprintPermissions({ footprint: { userId: 'u1' }, viewerId: 'u2', isAdmin: false }))
      .toEqual({ canDelete: false, canReport: true });
    expect(footprintPermissions({ footprint: { userId: 'u1' }, viewerId: 'u2', isAdmin: true }))
      .toEqual({ canDelete: true, canReport: false });
  });
});
