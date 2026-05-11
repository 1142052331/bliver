import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminPanel from '../components/AdminPanel';
import api from '../api';

// Mock the api module
vi.mock('../api', () => ({
  default: {
    get: vi.fn((url) => {
      if (url.includes('/admin/online')) {
        return Promise.resolve({ data: { online: [] } });
      }
      if (url.includes('/admin/users')) {
        return Promise.resolve({ data: { users: [] } });
      }
      if (url.includes('/admin/clones')) {
        return Promise.resolve({ data: { groups: [], totalUsers: 0, suspiciousCount: 0 } });
      }
      return Promise.resolve({ data: {} });
    }),
    post: vi.fn().mockResolvedValue({ data: { ok: true } }),
    put: vi.fn().mockResolvedValue({ data: { user: {} } }),
    delete: vi.fn().mockResolvedValue({ data: { ok: true } }),
  },
}));

describe('AdminPanel', () => {
  const mockSocketRef = { current: { on: vi.fn(), off: vi.fn() } };
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders without crashing', async () => {
    render(<AdminPanel onClose={mockOnClose} socketRef={mockSocketRef} />);
    await waitFor(() => {
      expect(screen.getByText('后台管理')).toBeInTheDocument();
    });
  });

  test('shows loading state initially', () => {
    render(<AdminPanel onClose={mockOnClose} socketRef={mockSocketRef} />);
    expect(screen.getByText('LOADING...')).toBeInTheDocument();
  });

  test('shows all tabs after loading', async () => {
    render(<AdminPanel onClose={mockOnClose} socketRef={mockSocketRef} />);
    await waitFor(() => {
      expect(screen.getByText(/在线人员/)).toBeInTheDocument();
      expect(screen.getByText(/所有用户/)).toBeInTheDocument();
      expect(screen.getByText(/审计日志/)).toBeInTheDocument();
    });
  });

  test('backdrop click calls onClose', async () => {
    const user = userEvent.setup();
    render(<AdminPanel onClose={mockOnClose} socketRef={mockSocketRef} />);

    await waitFor(() => screen.getByText('后台管理'));

    // Click the backdrop overlay
    const backdrop = document.querySelector('.absolute.inset-0.bg-black\\/70');
    expect(backdrop).toBeTruthy();
    await user.click(backdrop);
    expect(mockOnClose).toHaveBeenCalled();
  });

  test('switches to online tab', async () => {
    const user = userEvent.setup();
    render(<AdminPanel onClose={mockOnClose} socketRef={mockSocketRef} />);

    await waitFor(() => screen.getByText(/在线人员/));
    await user.click(screen.getByText(/在线人员/));
    await waitFor(() => {
      expect(screen.getByText('NO ACTIVE CONNECTIONS')).toBeInTheDocument();
    });
  });

  test('switches to audit log tab', async () => {
    const user = userEvent.setup();
    render(<AdminPanel onClose={mockOnClose} socketRef={mockSocketRef} />);

    await waitFor(() => screen.getByText(/审计日志/));
    await user.click(screen.getByText(/审计日志/));
    await waitFor(() => {
      expect(screen.getByText(/AWAITING EVENTS/)).toBeInTheDocument();
    });
  });

  test('find clones button is visible', async () => {
    render(<AdminPanel onClose={mockOnClose} socketRef={mockSocketRef} />);
    await waitFor(() => {
      expect(screen.getByText('侦测关联账号')).toBeInTheDocument();
    });
  });

  test('renders user list when data is loaded', async () => {
    // Override default mock for this specific test — must be BEFORE render
    api.get.mockResolvedValueOnce({ data: { online: [] } });
    api.get.mockResolvedValueOnce({
      data: {
        users: [{
          _id: '111111111111111111111111',
          name: 'testuser',
          avatarUrl: '',
          role: 'user',
          isOnline: true,
          footprintCount: 5,
          lastLoginIp: '1.2.3.4',
          registerIp: '1.2.3.4',
          createdAt: new Date().toISOString(),
        }],
      },
    });

    render(<AdminPanel onClose={mockOnClose} socketRef={mockSocketRef} />);

    await waitFor(() => {
      expect(screen.getByText('testuser')).toBeInTheDocument();
    });
  });
});
