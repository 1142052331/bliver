import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiClient } from '../../api';
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
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
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
    const lastCheckbox = screen.getByRole('checkbox', { name: '保持登录' });

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
    const keepSignedIn = screen.getByRole('checkbox', { name: '保持登录' });
    expect(keepSignedIn.closest('label')).toHaveClass('min-h-11');
    expect(keepSignedIn).toHaveClass('focus:ring-blue-500');
  });

  it('never prefills a password from legacy saved credentials', () => {
    const legacyCredentials = JSON.stringify({ name: 'legacy-user', pw: btoa('stored-password') });
    localStorage.setItem('bliver_cred', legacyCredentials);
    sessionStorage.setItem('bliver_cred', legacyCredentials);

    render(<AuthModal initialTab="login" onDone={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: 'Username' })).toHaveValue('');
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('stores a successful kept login without persisting the submitted password', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    apiClient.auth.login.mockResolvedValueOnce({
      data: { user: { _id: 'user-1', name: 'alice' }, token: 'login-token' },
    });
    render(<AuthModal initialTab="login" onDone={onDone} onClose={vi.fn()} />);

    await user.type(screen.getByRole('textbox', { name: 'Username' }), 'alice');
    await user.type(screen.getByLabelText('Password'), 'never-store-this-password');
    await user.click(screen.getByRole('checkbox', { name: '保持登录' }));
    await user.click(screen.getAllByRole('button', { name: 'Login' }).at(-1));

    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith({ _id: 'user-1', name: 'alice' }));
    expect(localStorage.getItem('bliver_token')).toBe('login-token');
    expect(sessionStorage.getItem('bliver_token')).toBeNull();
    expect(JSON.stringify(localStorage)).not.toContain('never-store-this-password');
    expect(JSON.stringify(sessionStorage)).not.toContain('never-store-this-password');
  });

  it('keeps registration temporary by default and never persists its password', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    apiClient.auth.register.mockResolvedValueOnce({
      data: { user: { _id: 'user-2', name: 'bob' }, token: 'register-token' },
    });
    render(<AuthModal initialTab="register" onDone={onDone} onClose={vi.fn()} />);

    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: '保持登录' })).not.toBeChecked();
    await user.type(screen.getByRole('textbox', { name: 'Username' }), 'bob');
    await user.type(screen.getByLabelText('Password'), 'another-private-password');
    await user.click(screen.getByRole('button', { name: 'Create Account' }));

    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith({ _id: 'user-2', name: 'bob' }));
    expect(sessionStorage.getItem('bliver_token')).toBe('register-token');
    expect(localStorage.getItem('bliver_token')).toBeNull();
    expect(JSON.stringify(localStorage)).not.toContain('another-private-password');
    expect(JSON.stringify(sessionStorage)).not.toContain('another-private-password');
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
