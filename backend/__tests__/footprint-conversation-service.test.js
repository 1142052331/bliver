const { comment } = require('../validators/schemas');

describe('footprint conversation contract', () => {
  test('accepts a top-level comment and a two-level reply', () => {
    expect(comment.parse({ content: '第一条' })).toEqual({ content: '第一条' });

    const reply = comment.parse({
      content: '回复你',
      parentCommentId: '507f1f77bcf86cd799439011',
      replyToCommentId: '507f1f77bcf86cd799439012',
    });

    expect(reply.parentCommentId).toBe('507f1f77bcf86cd799439011');
    expect(reply.replyToCommentId).toBe('507f1f77bcf86cd799439012');
  });

  test('rejects a direct reply without its top-level parent', () => {
    expect(() => comment.parse({
      content: 'broken',
      replyToCommentId: '507f1f77bcf86cd799439012',
    })).toThrow();
  });
});
