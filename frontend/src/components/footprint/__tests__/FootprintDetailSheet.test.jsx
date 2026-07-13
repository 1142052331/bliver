import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FootprintDetailSheet from '../FootprintDetailSheet';

describe('FootprintDetailSheet', () => {
  it('opens at the default snap and expands without leaving the dialog', async () => {
    const user = userEvent.setup();
    render(<FootprintDetailSheet onClose={vi.fn()}><p>detail</p></FootprintDetailSheet>);
    const dialog = screen.getByRole('dialog', { name: '足迹详情' });
    expect(dialog).toHaveAttribute('data-snap', 'default');

    await user.click(screen.getByRole('button', { name: '展开详情' }));
    expect(dialog).toHaveAttribute('data-snap', 'expanded');
    expect(screen.getByText('detail')).toBeInTheDocument();
  });
});
