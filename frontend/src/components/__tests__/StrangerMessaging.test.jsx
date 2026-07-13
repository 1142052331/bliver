import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import StrangerGreetingCard from '../StrangerGreetingCard';
import MessageSettings from '../MessageSettings';

describe('stranger messaging controls', () => {
  it('offers reply, ignore, and block for a greeting request', async () => {
    const user = userEvent.setup();
    const actions = { reply: vi.fn(), ignore: vi.fn(), block: vi.fn() };
    render(<StrangerGreetingCard request={{ senderName: '林野', content: '你好' }} onReply={actions.reply} onIgnore={actions.ignore} onBlock={actions.block} />);

    await user.click(screen.getByRole('button', { name: '回复并解锁' }));
    await user.click(screen.getByRole('button', { name: '忽略' }));
    await user.click(screen.getByRole('button', { name: '屏蔽' }));

    expect(actions.reply).toHaveBeenCalledOnce();
    expect(actions.ignore).toHaveBeenCalledOnce();
    expect(actions.block).toHaveBeenCalledOnce();
  });

  it('optimistically toggles the stranger message preference', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<MessageSettings value onChange={onChange} />);

    const toggle = screen.getByRole('switch', { name: '允许陌生人私信' });
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
