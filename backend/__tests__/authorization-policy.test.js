const { canDeleteComment, shouldIncludeSuperuser, shouldIncludeChatFriends } = require('../services/authorization');

describe('legacy authorization helpers use canonical founder identity', () => {
  test('a same-name ordinary user cannot moderate comments', () => {
    const actor = { id: 'actor-id', name: '阿森', role: 'user' };

    expect(canDeleteComment(actor, 'different-comment-author')).toBe(false);
  });

  test('admin role remains the only moderation bypass', () => {
    const actor = { id: 'admin-id', name: 'renamed-admin', role: 'admin' };

    expect(canDeleteComment(actor, 'different-comment-author')).toBe(true);
  });

  test('founder presentation helpers follow systemIdentity', () => {
    expect(shouldIncludeSuperuser({ name: 'Founder Renamed', systemIdentity: 'asen' })).toBe(false);
    expect(shouldIncludeChatFriends({ name: 'Founder Renamed', systemIdentity: 'asen' })).toBe(true);
    expect(shouldIncludeSuperuser({ name: '阿森', role: 'user' })).toBe(true);
  });
});
