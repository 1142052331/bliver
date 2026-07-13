import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FootprintConversation from '../FootprintConversation';

const comments = [
  { _id: 'root-new', username: 'New', content: 'new', createdAt: '2026-07-11T09:00:00.000Z', userId: 'u2' },
  { _id: 'reply-old', username: 'Reply', content: 'reply', createdAt: '2026-07-11T08:30:00.000Z', userId: 'u3', parentCommentId: 'root-old', replyToCommentId: 'root-old' },
  { _id: 'root-old', username: 'Old', content: 'old', createdAt: '2026-07-11T08:00:00.000Z', userId: 'u1' },
];

describe('FootprintConversation', () => {
  it('renders all comments immediately in chronological tree order', () => {
    render(<FootprintConversation comments={comments} userId="u2" onSubmitComment={vi.fn()} />);
    expect(screen.getAllByTestId('comment').map((node) => node.dataset.commentId))
      .toEqual(['root-old', 'reply-old', 'root-new']);
  });

  it('preserves a failed draft and exposes a retry action', async () => {
    const user = userEvent.setup();
    const onSubmitComment = vi.fn().mockRejectedValue(new Error('offline'));
    render(<FootprintConversation comments={[]} userId="u1" onSubmitComment={onSubmitComment} />);
    const input = screen.getByLabelText('评论内容');
    await user.type(input, 'keep this');
    await user.click(screen.getByRole('button', { name: '发送评论' }));
    expect(input).toHaveValue('keep this');
    expect(screen.getByRole('button', { name: '重试发送' })).toBeInTheDocument();
  });
});
