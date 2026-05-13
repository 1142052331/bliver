import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminPanel from '../components/AdminPanel';

// Mock the api module — use hoisted() because vi.mock is hoisted to top of file
const { mockGet, mockPost, mockPut, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn((url) => {
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
  mockPost: vi.fn().mockResolvedValue({ data: { ok: true } }),
  mockPut: vi.fn().mockResolvedValue({ data: { user: {} } }),
  mockDelete: vi.fn().mockResolvedValue({ data: { ok: true } }),
}));

vi.mock('../api', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete,
  },
  apiClient: {
    admin: {
      online(opts) { return mockGet('/api/admin/online', opts); },
      users(opts) { return mockGet('/api/admin/users', opts); },
      clones(opts) { return mockGet('/api/admin/clones', opts); },
      kick(userId) { return mockPost(`/api/admin/kick/${userId}`); },
      deleteUser(userId) { return mockDelete(`/api/admin/users/${userId}`); },
      updateUser(userId, data) { return mockPut(`/api/admin/users/${userId}`, data); },
    },
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
      expect(screen.getByText(/暂无审计记录/)).toBeInTheDocument();
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
    mockGet.mockResolvedValueOnce({ data: { online: [] } });
    mockGet.mockResolvedValueOnce({
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
