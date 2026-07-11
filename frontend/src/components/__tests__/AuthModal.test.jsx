import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthModal from '../AuthModal';
import TimelineDrawer from '../TimelineDrawer';

vi.mock('../../api', () => ({
  apiClient: {
    auth: {
      login: vi.fn(),
      register: vi.fn(),
    },
  },
}));

vi.mock('browser-image-compression', () => ({ default: vi.fn() }));

function AuthHarness() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>Open auth</button>
      {isOpen && (
        <AuthModal
          initialTab="login"
          onDone={vi.fn()}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

function NestedDialogsHarness() {
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [authOpen, setAuthOpen] = useState(true);

  return (
    <>
      <TimelineDrawer
        isOpen={timelineOpen}
        onClose={() => setTimelineOpen(false)}
        footprints={[]}
        userId="user-1"
        isAdmin={false}
        onSelectFootprint={vi.fn()}
        period="today"
        onChangePeriod={vi.fn()}
        loading={false}
      />
      {authOpen && (
        <AuthModal
          initialTab="login"
          onDone={vi.fn()}
          onClose={() => setAuthOpen(false)}
        />
      )}
    </>
  );
}

describe('AuthModal accessibility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('exposes a labelled modal dialog and meaningful form labels', () => {
    render(<AuthModal initialTab="login" onDone={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'Bliver' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Location sharing with friends');
    expect(screen.getByRole('textbox', { name: 'Username' })).toHaveFocus();
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('contains forward and reverse tab navigation inside the dialog', async () => {
    const user = userEvent.setup();
    render(<AuthModal initialTab="login" onDone={vi.fn()} onClose={vi.fn()} />);

    const closeButton = screen.getByRole('button', { name: 'Close authentication dialog' });
    const lastCheckbox = screen.getByRole('checkbox', { name: '自动登录' });

    closeButton.focus();
    await user.tab({ shift: true });
    expect(lastCheckbox).toHaveFocus();

    await user.tab();
    expect(closeButton).toHaveFocus();
  });

  it('closes on Escape and restores focus to the opener', async () => {
    const user = userEvent.setup();
    render(<AuthHarness />);

    const opener = screen.getByRole('button', { name: 'Open auth' });
    await user.click(opener);
    expect(screen.getByRole('dialog', { name: 'Bliver' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('lets only the topmost dialog handle Escape when Auth opens above Timeline', async () => {
    const user = userEvent.setup();
    render(<NestedDialogsHarness />);

    expect(screen.getByRole('dialog', { name: 'Bliver' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '足迹记录' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Bliver' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '足迹记录' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭足迹记录' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('uses keyboard-safe scrolling and 44px targets for compact controls', () => {
    const { container } = render(
      <AuthModal initialTab="login" onDone={vi.fn()} onClose={vi.fn()} />,
    );

    const overlay = container.firstElementChild;
    const dialog = screen.getByRole('dialog', { name: 'Bliver' });
    const closeButton = screen.getByRole('button', { name: 'Close authentication dialog' });

    expect(overlay).toHaveClass('overflow-y-auto', 'overscroll-contain');
    expect(dialog).toHaveClass('max-h-[calc(100dvh-1.5rem)]', 'overflow-y-auto');
    expect(closeButton).toHaveClass('h-11', 'min-h-11', 'w-11', 'min-w-11');
    expect(screen.getAllByRole('button', { name: 'Login' })[0]).toHaveClass('min-h-11');
    expect(screen.getByRole('button', { name: 'Register' })).toHaveClass('min-h-11');
    expect(screen.getByText('记住账号密码').closest('label')).toHaveClass('min-h-11');
    expect(screen.getByText('自动登录').closest('label')).toHaveClass('min-h-11');
  });

  it.each([
    [undefined, false],
    [true, true],
  ])('sets mobile navigation reservation to %s', (reserveMobileNavigation, shouldReserve) => {
    const { container } = render(
      <AuthModal
        initialTab="login"
        onDone={vi.fn()}
        onClose={vi.fn()}
        reserveMobileNavigation={reserveMobileNavigation}
      />,
    );

    const root = container.firstElementChild;
    if (shouldReserve) {
      expect(root).toHaveClass('bliver-destination-auth-surface');
    } else {
      expect(root).not.toHaveClass('bliver-destination-auth-surface');
    }
  });
});
