import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ModerationMenu from '../ModerationMenu';

describe('ModerationMenu', () => {
  it('shows only the permitted More actions', async () => {
    const user = userEvent.setup();
    render(<ModerationMenu targetType="comment" canDelete={false} canReport onReport={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '更多' }));
    expect(screen.queryByRole('menuitem', { name: '删除评论' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '举报评论' })).toBeInTheDocument();
  });
});
